import { isIP } from 'node:net';

export interface ThrottleInput {
	/** The client address as the server saw it; any spelling of one address shares a counter. */
	address: string;
	/** The Account's id, or null when the sign-in names none. */
	accountId: string | null;
}

export type ThrottleCheck = { allowed: true } | { allowed: false; retryAfterMs: number };

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
	/** Call after a right password; clears the account + address counter only. */
	succeed(input: ThrottleInput): void;
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
 * Three counters, none keyed on a string the client types: the address (20), the Account at an address
 * (5, which the address counter caps at 20 per address) and the Account (50). The caller looks the
 * Account up the way Better Auth does and passes its id, or null when there is none; then only the
 * address counter applies. If that lookup ever disagrees with the library, the Account limits are
 * skipped but the address limit still holds.
 *
 * The caller must show one message for "wrong password", "no such account" and "too many attempts",
 * or the Account limit tells an attacker whether an email has an Account. The Account limit also lets
 * someone lock a known Account out for a window; that is accepted.
 *
 * Each map is capped at maxKeys; expired entries are dropped first. Only the address map ever drops a
 * live entry (the one whose window ends earliest), and only when it holds more distinct unexpired
 * addresses than maxKeys. Residual: an attacker with more addresses than that inside one window gets
 * fresh per-address budgets and is still held to the per-Account limit. The Account maps never drop a
 * live entry (a full one skips storing the new key), and a full map never refuses an attempt.
 * Worst case: 3 * maxKeys entries.
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

	const slotsFor = ({ address, accountId }: ThrottleInput): [Counter, string][] => {
		const where = normaliseAddress(address);
		const slots: [Counter, string][] = [[addresses, where]];
		// The address has no '|', so the key is unambiguous whatever the id holds.
		if (accountId !== null) slots.push([pairs, `${where}|${accountId}`], [accounts, accountId]);
		return slots;
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
			for (const [c, id] of slots) {
				const entry = c.entries.get(id);
				if (entry && entry.count >= c.max)
					retryAfterMs = Math.max(retryAfterMs, entry.resetAt - at);
			}
			if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
			for (const [c, id] of slots) {
				const entry = c.entries.get(id);
				if (entry) {
					entry.count += 1;
					continue;
				}
				if (c.entries.size >= maxKeys) {
					// Only the address map may drop a live entry; Account maps keep theirs and skip the new key.
					if (c !== addresses) continue;
					const earliest = c.entries.keys().next().value;
					if (earliest !== undefined) c.entries.delete(earliest);
				}
				c.entries.set(id, { count: 1, resetAt: at + windowMs });
			}
			return { allowed: true };
		},
		succeed(input) {
			if (input.accountId === null) return;
			pairs.entries.delete(`${normaliseAddress(input.address)}|${input.accountId}`);
		},
		size: () => addresses.entries.size + pairs.entries.size + accounts.entries.size
	};
};
