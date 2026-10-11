import { isIP } from 'node:net';

/** The three counters one sign-in attempt touches. */
export interface ThrottleKey {
	/** Email at an address. */
	pair: string;
	/** Address alone; never cleared by a success. */
	address: string;
	/** Email alone. */
	email: string;
}

export type ThrottleCheck = { allowed: true } | { allowed: false; retryAfterMs: number };

export interface ThrottleOptions {
	/** Attempts per window for one email at one address. */
	limit?: number;
	/** Attempts per window for one address across all emails. */
	addressLimit?: number;
	/** Attempts per window for one email across all addresses. */
	emailLimit?: number;
	windowMs?: number;
	/** Cap on stored counters per kind (pair, address, email). */
	maxKeys?: number;
	now?: () => number;
}

export interface Throttle {
	/**
	 * Counts the attempt and admits it, or refuses without counting (also when a counter map is full). Synchronous, so concurrent
	 * sign-ins cannot all pass before any is counted. Call before checking the password.
	 */
	attempt(key: ThrottleKey): ThrottleCheck;
	/** Call after a right password; clears the email-scoped counters, never the address one. */
	succeed(key: ThrottleKey): void;
	size(): number;
}

const MAX_EMAIL = 254;
const UNKNOWN_ADDRESS = 'unknown';
const ODD_EMAIL = '\u0000odd';

/** Better Auth looks the user up by `email.toLowerCase()` and nothing else (1.7.7 sign-in). */
const normaliseEmail = (raw: string): string => {
	const email = raw.toLowerCase();
	return email === '' || email.length > MAX_EMAIL ? ODD_EMAIL : email;
};

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
	const address = raw.trim().split('%')[0];
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

export const throttleKey = (email: string, address: string): ThrottleKey => {
	const normalEmail = normaliseEmail(email);
	const normalAddress = normaliseAddress(address);
	return {
		pair: `${normalEmail}|${normalAddress}`,
		address: normalAddress,
		email: normalEmail
	};
};

interface Entry {
	count: number;
	/** The window starts at the first attempt and is fixed. */
	resetAt: number;
}

// Per-process: counters reset on restart and are not shared between instances.
// Worst-case memory: 3 * maxKeys entries (one map each for pair, address, email), never more.
// The email-alone counter lets someone lock a known email out for a window; that is accepted.
export const createThrottle = ({
	limit = 5,
	addressLimit = 20,
	emailLimit = 50,
	windowMs = 10 * 60_000,
	maxKeys = 10_000,
	now = Date.now
}: ThrottleOptions = {}): Throttle => {
	// Insertion order is window-start order, since windows are fixed, so the first entry expires first.
	const counter = (max: number) => ({ max, entries: new Map<string, Entry>() });
	const pairs = counter(limit);
	const addresses = counter(addressLimit);
	const emails = counter(emailLimit);
	type Counter = ReturnType<typeof counter>;

	const sweep = ({ entries }: Counter, at: number) => {
		for (const [id, entry] of entries) {
			if (entry.resetAt > at) return;
			entries.delete(id);
		}
	};

	const soonest = ({ entries }: Counter) => entries.values().next().value?.resetAt ?? 0;

	return {
		attempt(key) {
			const at = now();
			const slots: [Counter, string][] = [
				[pairs, key.pair],
				[addresses, key.address],
				[emails, key.email]
			];
			let retryAfterMs = 0;
			for (const [c, id] of slots) {
				sweep(c, at);
				const entry = c.entries.get(id);
				if (entry) {
					if (entry.count >= c.max) retryAfterMs = Math.max(retryAfterMs, entry.resetAt - at);
				} else if (c.entries.size >= maxKeys) {
					// Full of unexpired entries: never evict one, refuse until the soonest expires.
					retryAfterMs = Math.max(retryAfterMs, soonest(c) - at);
				}
			}
			if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
			for (const [c, id] of slots) {
				const entry = c.entries.get(id);
				if (entry) entry.count += 1;
				else c.entries.set(id, { count: 1, resetAt: at + windowMs });
			}
			return { allowed: true };
		},
		succeed({ pair, email }) {
			pairs.entries.delete(pair);
			emails.entries.delete(email);
		},
		size: () => pairs.entries.size + addresses.entries.size + emails.entries.size
	};
};
