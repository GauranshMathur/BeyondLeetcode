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
 * Account for unknown emails), because they differ in who chooses the key. A real Account id exists only
 * for a real Account, so its maps hold as many keys as there are Accounts and never fill in practice; they
 * never drop a live entry (a full one skips the new key), which is what holds an Account to 5 tries per
 * address and 50 overall however many addresses an attacker has. An unknown email is whatever the client
 * types, so its maps are the ones a flood of made-up emails fills. When one is full it evicts the entry
 * whose window ends earliest and never skips or refuses, so a flood can only evict other made-up emails:
 * a known Account's counters stay. Residual: to make one unknown email forget its count, an attacker must
 * push it out, which takes more than maxKeys other emails inside one window, so more than maxKeys / 20
 * addresses, for each fresh set of guesses. The address map evicts the same way, with the same residual:
 * an attacker with more addresses than maxKeys inside one window gets fresh per-address budgets and is
 * still held to the per-Account limit.
 *
 * A right password takes its own attempt back from the address and the Account counters (`succeed`), if
 * their window is still the one it was counted in, so only wrong passwords spend budget. Callers that
 * count successes too (Sign up) never call it.
 *
 * The caller must show one message for "wrong password", "no such account" and "too many attempts",
 * or the Account limit tells an attacker whether an email has an Account. The Account limit also lets
 * someone lock a known Account out for a window; that is accepted.
 *
 * Each map is capped at maxKeys, expired entries dropped first, and a full map never refuses an attempt.
 * Worst case: 5 * maxKeys entries.
 */
export const createThrottle = ({
	limit = 5,
	addressLimit = 20,
	accountLimit = 50,
	windowMs = 10 * 60_000,
	maxKeys = 10_000,
	now = Date.now
}: ThrottleOptions = {}): Throttle => {
	// Insertion order is window-start order, since windows are fixed, so the first entry ends first.
	// `evicts`: a full map drops its earliest-ending entry for the new key; otherwise it skips the new key.
	const counter = (max: number, evicts: boolean) => ({
		max,
		evicts,
		entries: new Map<string, Entry>()
	});
	const addresses = counter(addressLimit, true);
	const pairs = counter(limit, false);
	const accounts = counter(accountLimit, false);
	const emailPairs = counter(limit, true);
	const emailAccounts = counter(accountLimit, true);
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
				const entry = c.entries.get(id);
				if (entry && entry.count >= c.max)
					retryAfterMs = Math.max(retryAfterMs, entry.resetAt - at);
			}
			if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
			const counted: Partial<Record<Slot, CountedIn>> = {};
			for (const [slot, c, id] of slots) {
				const entry = c.entries.get(id);
				if (entry) {
					entry.count += 1;
					counted[slot] = { key: id, resetAt: entry.resetAt };
					continue;
				}
				if (c.entries.size >= maxKeys) {
					// Only maps for keys the client chooses may drop a live entry; the rest keep theirs and skip the new key.
					if (!c.evicts) continue;
					const earliest = c.entries.keys().next().value;
					if (earliest !== undefined) c.entries.delete(earliest);
				}
				c.entries.set(id, { count: 1, resetAt: at + windowMs });
				counted[slot] = { key: id, resetAt: at + windowMs };
			}
			// The address slot is always counted: the address map evicts instead of skipping.
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
		size: () => everyCounter.reduce((total, c) => total + c.entries.size, 0)
	};
};
