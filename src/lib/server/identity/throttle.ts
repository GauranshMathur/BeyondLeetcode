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
	/** Cap on stored counters (each attempt uses three). */
	maxKeys?: number;
	now?: () => number;
}

export interface Throttle {
	/**
	 * Counts the attempt and admits it, or refuses without counting. Synchronous, so concurrent
	 * sign-ins cannot all pass before any is counted. Call before checking the password.
	 */
	attempt(key: ThrottleKey): ThrottleCheck;
	/** Call after a right password; clears the email-scoped counters, never the address one. */
	succeed(key: ThrottleKey): void;
	size(): number;
}

const MAX_EMAIL = 254;
const MAX_ADDRESS = 64;

/** IPv6 is keyed on its /64 prefix, so rotating privacy addresses share one budget. */
const normaliseAddress = (raw: string): string => {
	const address = raw.trim().toLowerCase().split('%')[0].slice(0, MAX_ADDRESS);
	const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) return mapped[1];
	if (!address.includes(':')) return address;
	const [head, tail] = address.split('::');
	const headGroups = head ? head.split(':') : [];
	const tailGroups = tail === undefined ? [] : tail ? tail.split(':') : [];
	const fill = tail === undefined ? 0 : Math.max(0, 8 - headGroups.length - tailGroups.length);
	const groups = [...headGroups, ...Array<string>(fill).fill('0'), ...tailGroups];
	return `${groups
		.slice(0, 4)
		.map((g) => g.replace(/^0+(?=.)/, ''))
		.join(':')}::/64`;
};

export const throttleKey = (email: string, address: string): ThrottleKey => {
	const normalEmail = email.trim().toLowerCase().slice(0, MAX_EMAIL);
	const normalAddress = normaliseAddress(address);
	return {
		pair: `p:${normalEmail}|${normalAddress}`,
		address: `a:${normalAddress}`,
		email: `e:${normalEmail}`
	};
};

interface Entry {
	count: number;
	/** The window starts at the first attempt and is fixed. */
	resetAt: number;
	limit: number;
}

// Per-process: counters reset on restart and are not shared between instances.
// The email-alone counter lets someone lock a known email out for a window; that is accepted.
export const createThrottle = ({
	limit = 5,
	addressLimit = 20,
	emailLimit = 50,
	windowMs = 10 * 60_000,
	maxKeys = 10_000,
	now = Date.now
}: ThrottleOptions = {}): Throttle => {
	// Map order is insertion order, which is window-start order because windows are fixed.
	const entries = new Map<string, Entry>();

	const live = (id: string, at: number): Entry | undefined => {
		const entry = entries.get(id);
		if (entry && entry.resetAt <= at) {
			entries.delete(id);
			return undefined;
		}
		return entry;
	};

	const makeRoom = (at: number) => {
		if (entries.size < maxKeys) return;
		for (const [id, entry] of entries) if (entry.resetAt <= at) entries.delete(id);
		// Still full: drop the oldest key that is not blocked; blocked keys go only when all are blocked.
		for (const [id, entry] of entries) {
			if (entries.size < maxKeys) return;
			if (entry.count < entry.limit) entries.delete(id);
		}
		for (const id of entries.keys()) {
			if (entries.size < maxKeys) return;
			entries.delete(id);
		}
	};

	const bump = (id: string, max: number, at: number) => {
		const entry = live(id, at);
		if (entry) {
			entry.count += 1;
			return;
		}
		makeRoom(at);
		entries.set(id, { count: 1, resetAt: at + windowMs, limit: max });
	};

	return {
		attempt({ pair, address, email }) {
			const at = now();
			const counters: [string, number][] = [
				[pair, limit],
				[address, addressLimit],
				[email, emailLimit]
			];
			let retryAfterMs = 0;
			for (const [id, max] of counters) {
				const entry = live(id, at);
				if (entry && entry.count >= max) retryAfterMs = Math.max(retryAfterMs, entry.resetAt - at);
			}
			if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
			for (const [id, max] of counters) bump(id, max, at);
			return { allowed: true };
		},
		succeed({ pair, email }) {
			entries.delete(pair);
			entries.delete(email);
		},
		size: () => entries.size
	};
};
