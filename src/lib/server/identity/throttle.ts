import { isIP } from 'node:net';

export interface ThrottleInput {
	/** The client address as the server saw it; any spelling of one address shares a counter. */
	address: string;
	/**
	 * Whom the sign-in names, as a key: an Account's id, or for an email that has no Account a digest of
	 * that email (the caller makes it, see `signin/sign-in.ts`). Null when it names nobody (a blank form).
	 */
	accountId: string | null;
}

/**
 * Opaque: what `attempt` counted and in which window, handed back to `succeed`. Not to be built or read
 * by callers.
 */
export interface ThrottleToken {
	/** Whether the attempt named an Account; one that named none gives nothing back. */
	readonly named: boolean;
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
	/** Cap on stored counters per map (address, account + address, account). */
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
 * address) and the Account (50). The caller names the Account by a key (`accountId`): the id of the Account
 * the email names, looked up the way Better Auth does, or, when the email has no Account, a digest of the
 * email (`email:` + its SHA-256), so the real address is never held in memory. Known and unknown emails
 * therefore reach the throttled state on the same schedule. Without that, only a known email would be
 * throttled, and since a throttled refusal skips the password hash and answers faster, six tries and a
 * stopwatch would tell an attacker which emails have an Account. The only key built from what the client
 * typed is that digest, which is bounded in size and counted in the capped Account maps (below). A blank
 * form names nobody (null) and only the address counter applies.
 *
 * A right password takes its own attempt back from the address and the Account counters (`succeed`), if
 * their window is still the one it was counted in, so only wrong passwords spend budget. Callers that
 * count successes too (Sign up) never call it.
 *
 * The caller must show one message for "wrong password", "no such account" and "too many attempts",
 * or the Account limit tells an attacker whether an email has an Account. The Account limit also lets
 * someone lock a known Account out for a window; that is accepted.
 *
 * Each map is capped at maxKeys; expired entries are dropped first. Only the address map ever drops a
 * live entry (the one whose window ends earliest), and only when it holds more distinct unexpired
 * addresses than maxKeys. Residual: an attacker with more addresses than that inside one window gets
 * fresh per-address budgets and is still held to the per-Account limit. The Account maps never drop a
 * live entry (a full one skips storing the new key), and a full map never refuses an attempt. Because
 * unknown emails are counted too, an attacker typing many different emails can fill the Account maps: new
 * keys then go uncounted until entries expire, and the address limit still holds. Doing that takes more
 * than maxKeys attempts inside one window, so more than maxKeys / 20 addresses. Worst case: 3 * maxKeys
 * entries.
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
	const counter = (max: number) => ({ max, entries: new Map<string, Entry>() });
	const addresses = counter(addressLimit);
	const pairs = counter(limit);
	const accounts = counter(accountLimit);
	type Counter = ReturnType<typeof counter>;

	type Slot = 'address' | 'pair' | 'account';
	const slotsFor = ({ address, accountId }: ThrottleInput): [Slot, Counter, string][] => {
		const where = normaliseAddress(address);
		const slots: [Slot, Counter, string][] = [['address', addresses, where]];
		// The address has no '|', so the key is unambiguous whatever the id holds.
		if (accountId !== null) {
			slots.push(['pair', pairs, `${where}|${accountId}`], ['account', accounts, accountId]);
		}
		return slots;
	};

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
			for (const c of [addresses, pairs, accounts]) sweep(c, at);
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
					// Only the address map may drop a live entry; Account maps keep theirs and skip the new key.
					if (c !== addresses) continue;
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
					named: input.accountId !== null,
					counted: { address: address as CountedIn, pair, account },
					spent: false
				}
			};
		},
		succeed(token) {
			const { address, pair, account } = token.counted;
			// No Account was named, or this token already gave its count back.
			if (token.spent || !token.named) return;
			token.spent = true;
			// The pair counter is cleared, but only the window the right password belongs to.
			if (pair && sameWindow(pairs, pair)) pairs.entries.delete(pair.key);
			giveBack(addresses, address);
			giveBack(accounts, account);
		},
		size: () => addresses.entries.size + pairs.entries.size + accounts.entries.size
	};
};
