/** One sign-in attempt's two counters: the email at an address, and the address alone. */
export interface ThrottleKey {
	pair: string;
	address: string;
}

export type ThrottleCheck = { allowed: true } | { allowed: false; retryAfterMs: number };

export interface ThrottleOptions {
	/** Failures per window for one email at one address. */
	limit?: number;
	/** Failures per window for one address across all emails. */
	addressLimit?: number;
	windowMs?: number;
	/** Cap on stored counters (each attempt uses two). */
	maxKeys?: number;
	now?: () => number;
}

export interface Throttle {
	/** Never counts. Refuses without the caller checking the password. */
	check(key: ThrottleKey): ThrottleCheck;
	/** Call after a wrong password. */
	fail(key: ThrottleKey): void;
	/** Call after a right password; clears the pair only, never the address count. */
	succeed(key: ThrottleKey): void;
	size(): number;
}

export const throttleKey = (email: string, address: string): ThrottleKey => ({
	pair: `p:${email.trim().toLowerCase()}|${address}`,
	address: `a:${address}`
});

interface Entry {
	count: number;
	/** The window starts at the first failure and is fixed. */
	resetAt: number;
	limit: number;
}

// Per-process: counters reset on restart and are not shared between instances.
export const createThrottle = ({
	limit = 5,
	addressLimit = 20,
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
		check({ pair, address }) {
			const at = now();
			let retryAfterMs = 0;
			for (const id of [pair, address]) {
				const entry = live(id, at);
				if (entry && entry.count >= entry.limit) {
					retryAfterMs = Math.max(retryAfterMs, entry.resetAt - at);
				}
			}
			return retryAfterMs > 0 ? { allowed: false, retryAfterMs } : { allowed: true };
		},
		fail({ pair, address }) {
			const at = now();
			bump(pair, limit, at);
			bump(address, addressLimit, at);
		},
		succeed({ pair }) {
			entries.delete(pair);
		},
		size: () => entries.size
	};
};
