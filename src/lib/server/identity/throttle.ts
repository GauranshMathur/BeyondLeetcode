import { randomInt } from 'node:crypto';
import { isIP } from 'node:net';

export interface ThrottleInput {
	/** The client address as the server saw it; any spelling of one address shares a counter. */
	address: string;
	/** The id of the Account the sign-in names, or null when it names none. */
	accountId: string | null;
	/**
	 * Set when `accountId` is null and the sign-in typed an email: a digest that stands for that email (the
	 * caller makes it, see `signin/sign-in.ts`). Such keys are the client's to choose, so they have counters
	 * of their own, apart from real Account ids. Ignored when `accountId` is set.
	 */
	unknownEmail?: string;
}

/**
 * Opaque: what `attempt` counted and in which window, handed back to `succeed`. Not to be built or read
 * by callers.
 */
export interface ThrottleToken {
	/** Which kind of key the attempt named, so `succeed` finds the same counters; null gives nothing back. */
	readonly named: 'account' | 'email' | null;
	readonly counted: {
		readonly address: CountedIn;
		readonly pair?: CountedIn;
		readonly account?: CountedIn;
	};
	spent: boolean;
}

/** The entry an attempt was counted in: its key and the end of its window, which names the window. */
interface CountedIn {
	readonly key: string;
	readonly resetAt: number;
}

export type ThrottleCheck =
	| { allowed: true; token: ThrottleToken }
	| { allowed: false; retryAfterMs: number };

export interface ThrottleOptions {
	/** Attempts per window for one Account from one address. */
	limit?: number;
	/** Attempts per window for one address across all Accounts. */
	addressLimit?: number;
	/** Attempts per window for one Account across all addresses. */
	accountLimit?: number;
	windowMs?: number;
	/** Cap on stored counters per map (five maps: see `createThrottle`). */
	maxKeys?: number;
	/** Seeds the hashes of the evicted-Account sketch; unpredictable by default. Tests fix it. */
	salt?: number;
	now?: () => number;
}

export interface Throttle {
	/**
	 * Counts the attempt and admits it, or refuses without counting. Synchronous, so concurrent
	 * sign-ins cannot all pass before any is counted. Call before checking the password.
	 */
	attempt(input: ThrottleInput): ThrottleCheck;
	/**
	 * Call with the token of an admitted attempt after a right password. Clears the Account + address
	 * counter, and takes back the one count `attempt` added to the address and to the Account, so right
	 * passwords never use up either budget (a class behind one shared address would otherwise be locked out
	 * after 20 sign-ins). Never clears the address or Account counters: a valid Account cannot reset what
	 * someone's wrong guesses used.
	 *
	 * A counter gives back only if it is still in the window the attempt was counted in. If the window
	 * ended and a new one began meanwhile, that count is gone and the new window's failures stay. A token
	 * is good once. A token with no Account (a blank form, as Sign up uses) gives nothing back.
	 */
	succeed(token: ThrottleToken): void;
	/**
	 * Takes back the one count `attempt` added to the address, for a token that names no Account (a provider
	 * sign-in start, whose count `succeed` ignores). Same window rule as `succeed`, and a token is good once.
	 * Only the address counter moves: nothing else was counted for such a token.
	 */
	refund(token: ThrottleToken): void;
	size(): number;
}

const UNKNOWN_ADDRESS = 'unknown';

const hextets = (address: string): number[] => {
	let text = address;
	const lastColon = text.lastIndexOf(':');
	const tail = text.slice(lastColon + 1);
	if (tail.includes('.')) {
		const [a, b, c, d] = tail.split('.').map(Number);
		text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}
	const [head, rest] = text.split('::');
	const first = head ? head.split(':') : [];
	const last = rest === undefined ? [] : rest ? rest.split(':') : [];
	const fill = rest === undefined ? 0 : 8 - first.length - last.length;
	return [...first, ...Array<string>(fill).fill('0'), ...last].map((g) => Number.parseInt(g, 16));
};

/** IPv4 keys on the whole address (IPv4-mapped IPv6 included), IPv6 on its /64; junk shares one bucket. */
const normaliseAddress = (raw: string): string => {
	const trimmed = raw.trim();
	const zone = trimmed.indexOf('%');
	// A zone id is only legal on IPv6; anything else with a % is junk.
	const address =
		zone > 0 && zone < trimmed.length - 1 && isIP(trimmed.slice(0, zone)) === 6
			? trimmed.slice(0, zone)
			: trimmed;
	const kind = isIP(address);
	if (kind === 4) return address;
	if (kind !== 6) return UNKNOWN_ADDRESS;
	const g = hextets(address);
	if (g.length !== 8) return UNKNOWN_ADDRESS;
	if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
		return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
	}
	return `${g
		.slice(0, 4)
		.map((x) => x.toString(16))
		.join(':')}::/64`;
};

interface Entry {
	count: number;
	/** The window starts at the first attempt and is fixed. */
	resetAt: number;
}

/**
 * In-memory sign-in throttle, per process: counters reset on restart and are not shared between instances.
 *
 * Three counters: the address (20), the Account at an address (5, which the address counter caps at 20 per
 * address) and the Account (50). The caller looks the Account up the way Better Auth does and passes its
 * id (`accountId`). A blank form names nobody (both null) and only the address counter applies.
 *
 * Emails that have no Account are limited too (`unknownEmail`, a digest of the normalised email, so the
 * address itself is never held in memory), on the same schedule as a known one. Without that, only a
 * known email would ever be throttled, and since a throttled refusal skips the password hash and answers
 * faster, six tries and a stopwatch would tell an attacker which emails have an Account.
 *
 * The two kinds of key have separate maps, five in all (address; pair and Account for real ids; pair and
 * Account for unknown emails), because they differ in who chooses the key. The address, pair and
 * unknown-email maps can be filled by the client: the address by its addresses, the unknown-email maps by
 * made-up emails, and the pair map by address x Account combinations (the pair key holds the address, so a
 * few hundred addresses and a few hundred known emails reach maxKeys). When one of them is full it evicts the
 * entry whose window ends earliest and never skips or refuses, so a fresh key always gets in with a full
 * budget.
 *
 * The Account map holds one entry per real Account tried in the window, so it fills only on an Instance
 * with more than maxKeys Accounts tried in 10 minutes, but a client who knows that many ids can fill it.
 * Evicting an Account's entry must not hand that Account a fresh 50, so a full map evicts the entry with the
 * fewest counts (the earliest of those) and never skips the new Account, and an evicted entry leaves its
 * count and window end in a fixed-size sketch (see `remember`). An Account tried again is counted from what
 * the sketch holds, so it never starts below the count it had. Alternating a target with new Accounts to
 * push it out each time therefore gains nothing: the target keeps its count. A sketch collision can only
 * raise an Account's count, so an Account may be refused a few tries early, never admitted past 50; to
 * push innocent Accounts to 50 through it, a flood must evict entries holding high counts in both rows of
 * their slots, which costs about 50 admitted tries per slot (and each counts against its address and pair).
 * A restored entry keeps the evicted one's window end, so a token counted before the eviction still matches it
 * and gives back its one count, which the restored count includes. Entries restored out of window order are
 * dropped when met (`held`), since `sweep` only trims the front.
 * `emailAccounts` never skipped (it evicts the earliest window like the pair maps); made-up emails have no
 * Account behind them, so only the timing residual below applies to it, and it has no sketch.
 *
 * Residual, once these maps evict: an attacker who pushes one pair or one unknown email out gets a fresh
 * count for it. Filling a map takes up to maxKeys admitted tries; after that each new key evicts the entry
 * that ends earliest, so a key that is the oldest goes after one new key, and any other after the number of
 * entries ahead of it plus one (at most maxKeys, or about maxKeys / 20 addresses). For a known
 * Account a fresh pair count is at most 5 more tries from one address, still counted against the address
 * (20) and the Account (50), so the total guesses on an Account do not grow.
 *
 * Timing residual, in two directions, both from a flood of more than maxKeys keys from about maxKeys / 20
 * addresses or /64s in one window, for as long as the flood lasts. (1) Unknown email: the flood pushes its
 * entry out of `emailPairs`; its next try is counted afresh and runs the slow password hash, while a known
 * Account's try is refused fast once its pair counter (5) is full. (2) Known email: the attacker spends the
 * target's 5 tries from one address, then floods `pairs` with other known Accounts from other addresses
 * until that pair is evicted; if the email has an Account, its next tries are admitted again and run the
 * hash, while an email with none sits in `emailPairs`, which that flood does not touch, and stays refused
 * fast. The cost scales with maxKeys; it is accepted. An attacker with more addresses than maxKeys inside
 * one window gets fresh per-address budgets and is still held to the per-Account limit.
 *
 * A right password takes its own attempt back from the address and the Account counters (`succeed`), if
 * their window is still the one it was counted in, so only wrong passwords spend budget. Callers that
 * count successes too (Sign up) never call it.
 *
 * The caller must show one message for "wrong password", "no such account" and "too many attempts",
 * or the Account limit tells an attacker whether an email has an Account. The Account limit also lets
 * someone lock a known Account out for a window; that is accepted.
 *
 * Each map is capped at maxKeys, expired entries dropped first, and a full map never refuses an attempt
 * or skips a key. Worst case: 5 * maxKeys entries, plus the sketch: 2 * 4 * maxKeys slots of 10 bytes.
 */
export const createThrottle = ({
	limit = 5,
	addressLimit = 20,
	accountLimit = 50,
	windowMs = 10 * 60_000,
	maxKeys = 10_000,
	salt = randomInt(2 ** 32),
	now = Date.now
}: ThrottleOptions = {}): Throttle => {
	// Insertion order is window-start order, since windows are fixed, so the first entry ends first.
	// `evicts`: which entry a full map drops for the new key. 'earliest' drops the entry whose window ends
	// first. 'fewest' drops the entry with the fewest counts (the earliest of those), because an evicted
	// entry's counts are what its owner gets back: the Account counter must make that as little as it can.
	const counter = (max: number, evicts: 'earliest' | 'fewest') => ({
		max,
		evicts,
		entries: new Map<string, Entry>()
	});
	const addresses = counter(addressLimit, 'earliest');
	const pairs = counter(limit, 'earliest');
	const accounts = counter(accountLimit, 'fewest');
	const emailPairs = counter(limit, 'earliest');
	const emailAccounts = counter(accountLimit, 'earliest');
	const everyCounter = [addresses, pairs, accounts, emailPairs, emailAccounts];
	type Counter = ReturnType<typeof counter>;

	type Slot = 'address' | 'pair' | 'account';
	const slotsFor = ({
		address,
		accountId,
		unknownEmail
	}: ThrottleInput): [Slot, Counter, string][] => {
		const where = normaliseAddress(address);
		const slots: [Slot, Counter, string][] = [['address', addresses, where]];
		// The address has no '|', so the key is unambiguous whatever the id or digest holds.
		if (accountId !== null) {
			slots.push(['pair', pairs, `${where}|${accountId}`], ['account', accounts, accountId]);
		} else if (unknownEmail !== undefined) {
			slots.push(
				['pair', emailPairs, `${where}|${unknownEmail}`],
				['account', emailAccounts, unknownEmail]
			);
		}
		return slots;
	};

	const countersOf = (named: 'account' | 'email') =>
		named === 'account' ? { pairs, accounts } : { pairs: emailPairs, accounts: emailAccounts };

	/** The entry `counted` names, only if it is still in the window the attempt was counted in. */
	const sameWindow = ({ entries }: Counter, counted: CountedIn | undefined) => {
		const entry = counted && entries.get(counted.key);
		return entry && counted && entry.resetAt === counted.resetAt ? entry : undefined;
	};

	/** One count less; an entry left at zero is dropped, as if the attempt had never been made. */
	const giveBack = (c: Counter, counted: CountedIn | undefined) => {
		const entry = sameWindow(c, counted);
		if (!entry || !counted) return;
		if (entry.count <= 1) c.entries.delete(counted.key);
		else entry.count -= 1;
	};

	/** The key to drop from a full map: the first entry, or the first one with the fewest counts. */
	const victimOf = ({ entries, evicts }: Counter): string | undefined => {
		if (evicts === 'earliest') return entries.keys().next().value;
		let victim: string | undefined;
		let fewest = Number.POSITIVE_INFINITY;
		for (const [id, entry] of entries) {
			if (entry.count >= fewest) continue;
			victim = id;
			fewest = entry.count;
			// Counts are at least 1, and ties go to the earliest, so nothing later can beat this.
			if (fewest <= 1) break;
		}
		return victim;
	};

	// What the Account map remembers of the Accounts it evicted, in a fixed size (a count-min sketch): SKETCH_ROWS
	// rows of maxKeys * 4 slots, each holding the largest count and the latest window end of the evicted
	// entries that hash to it. An Account that is tried again after its entry went is given the smallest slot
	// count over its rows, so it never starts below what it had (the slot has seen at least that count); a
	// collision can only raise it. A slot whose window has ended is dead. Only the Account map uses it.
	const SKETCH_ROWS = 2;
	const sketchWidth = maxKeys * 4;
	const sketchCounts = new Uint16Array(SKETCH_ROWS * sketchWidth);
	const sketchEnds = new Float64Array(SKETCH_ROWS * sketchWidth);
	const slotOf = (row: number, key: string) => {
		let h = (salt ^ Math.imul(row + 1, 0x9e3779b1)) >>> 0;
		for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
		h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
		return row * sketchWidth + (h % sketchWidth);
	};
	const remember = (key: string, { count, resetAt }: Entry, at: number) => {
		for (let row = 0; row < SKETCH_ROWS; row++) {
			const slot = slotOf(row, key);
			const live = sketchEnds[slot] > at;
			sketchCounts[slot] = Math.max(live ? sketchCounts[slot] : 0, count);
			sketchEnds[slot] = Math.max(live ? sketchEnds[slot] : 0, resetAt);
		}
	};
	/** What the sketch holds for a key whose entry is gone: undefined, or a count and window end. */
	const recall = (key: string, at: number): Entry | undefined => {
		let count = Number.POSITIVE_INFINITY;
		let resetAt = Number.POSITIVE_INFINITY;
		for (let row = 0; row < SKETCH_ROWS; row++) {
			const slot = slotOf(row, key);
			if (sketchEnds[slot] <= at) return undefined;
			count = Math.min(count, sketchCounts[slot]);
			resetAt = Math.min(resetAt, sketchEnds[slot]);
		}
		return { count, resetAt };
	};
	/** The entry for a key: the map's, or for the Account map what the sketch holds of an evicted one. */
	const lookup = (c: Counter, id: string, at: number): Entry | undefined =>
		held(c, id, at) ?? (c === accounts ? recall(id, at) : undefined);
	/**
	 * The map's entry for a key, if its window has not ended. `sweep` stops at the first live entry, and an
	 * Account restored from the sketch keeps its old window end behind newer entries, so an ended entry can
	 * sit past that point: drop it when met.
	 */
	const held = (c: Counter, id: string, at: number): Entry | undefined => {
		const entry = c.entries.get(id);
		if (entry && entry.resetAt <= at) {
			c.entries.delete(id);
			return undefined;
		}
		return entry;
	};

	const sweep = ({ entries }: Counter, at: number) => {
		for (const [id, entry] of entries) {
			if (entry.resetAt > at) return;
			entries.delete(id);
		}
	};

	return {
		attempt(input) {
			const at = now();
			for (const c of everyCounter) sweep(c, at);
			const slots = slotsFor(input);
			let retryAfterMs = 0;
			for (const [, c, id] of slots) {
				const entry = lookup(c, id, at);
				if (entry && entry.count >= c.max)
					retryAfterMs = Math.max(retryAfterMs, entry.resetAt - at);
			}
			if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
			const counted: Partial<Record<Slot, CountedIn>> = {};
			for (const [slot, c, id] of slots) {
				const live = held(c, id, at);
				if (live) {
					live.count += 1;
					counted[slot] = { key: id, resetAt: live.resetAt };
					continue;
				}
				if (c.entries.size >= maxKeys) {
					const victim = victimOf(c);
					const gone = victim === undefined ? undefined : c.entries.get(victim);
					if (victim !== undefined) c.entries.delete(victim);
					if (c === accounts && victim !== undefined && gone) remember(victim, gone, at);
				}
				// An evicted Account comes back with the count and window it had, not a fresh 50.
				const back = c === accounts ? recall(id, at) : undefined;
				const resetAt = back ? back.resetAt : at + windowMs;
				c.entries.set(id, { count: (back?.count ?? 0) + 1, resetAt });
				counted[slot] = { key: id, resetAt };
			}
			// Every slot is counted: a full map evicts to make room and never skips the new key.
			const { address, pair, account } = counted;
			return {
				allowed: true,
				token: {
					named:
						input.accountId !== null
							? 'account'
							: input.unknownEmail !== undefined
								? 'email'
								: null,
					counted: { address: address as CountedIn, pair, account },
					spent: false
				}
			};
		},
		succeed(token) {
			const { address, pair, account } = token.counted;
			// No Account or email was named, or this token already gave its count back.
			if (token.spent || token.named === null) return;
			token.spent = true;
			const named = countersOf(token.named);
			// The pair counter is cleared, but only the window the right password belongs to.
			if (pair && sameWindow(named.pairs, pair)) named.pairs.entries.delete(pair.key);
			giveBack(addresses, address);
			giveBack(named.accounts, account);
		},
		refund(token) {
			if (token.spent) return;
			token.spent = true;
			giveBack(addresses, token.counted.address);
		},
		size: () => everyCounter.reduce((total, c) => total + c.entries.size, 0)
	};
};

export interface ProviderStarts {
	/** The limit on starts (20 per address per window): the flood guard for the state rows a start writes. */
	readonly throttle: Throttle;
	/** Remembers which counted start the provider flow named `state` belongs to. */
	record(state: string, token: ThrottleToken): void;
	/** Gives that start back, once. A state never recorded, expired or already refunded changes nothing. */
	refund(state: string): void;
	size(): number;
}

/**
 * The starts of provider sign-ins, shared by the Sign in page (which starts them) and the provider callback
 * (which completes them). A start is counted when it begins, because it writes a state row and the limit is
 * its flood guard; it is given back only when its callback signs someone in. Each start is keyed by the OAuth
 * `state` of its authorize URL, so one callback refunds exactly one start, once. The map holds `maxKeys`
 * entries and keeps each for `windowMs`, as the throttle does; a full map drops the oldest, whose start then
 * simply stays counted.
 */
export const createProviderStarts = ({
	throttle = createThrottle(),
	windowMs = 10 * 60_000,
	maxKeys = 10_000,
	now = Date.now
}: {
	throttle?: Throttle;
	windowMs?: number;
	maxKeys?: number;
	now?: () => number;
} = {}): ProviderStarts => {
	// Insertion order is expiry order, as the window is fixed.
	const started = new Map<string, { token: ThrottleToken; expiresAt: number }>();
	return {
		throttle,
		record(state, token) {
			const at = now();
			for (const [key, entry] of started) {
				if (entry.expiresAt > at) break;
				started.delete(key);
			}
			if (started.size >= maxKeys) {
				const oldest = started.keys().next().value;
				if (oldest !== undefined) started.delete(oldest);
			}
			started.set(state, { token, expiresAt: at + windowMs });
		},
		refund(state) {
			const entry = started.get(state);
			if (!entry) return;
			started.delete(state);
			if (entry.expiresAt > now()) throttle.refund(entry.token);
		},
		size: () => started.size
	};
};

/** The one set of provider starts of this process: the Sign in page and the auth callback share it. */
export const providerStarts = createProviderStarts();
