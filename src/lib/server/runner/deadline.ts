/**
 * A leaf module: the Engine and the container module both bound their calls with it, and
 * neither may import the other for it.
 */

/**
 * A point in time fixed when it is made. It runs on the monotonic clock, so a host clock that
 * steps back cannot stretch it.
 */
export function deadline(totalMs: number) {
	const end = performance.now() + totalMs;
	return {
		/** Milliseconds until the deadline, never below zero. */
		left: () => Math.max(0, end - performance.now()),
		/** Settles with `promise`, or rejects with `message` once `capMs` or the deadline, whichever is first, has passed. */
		bound<T>(promise: Promise<T>, message: string, capMs = Number.POSITIVE_INFINITY): Promise<T> {
			return new Promise((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error(message)),
					Math.min(capMs, Math.max(0, end - performance.now()))
				);
				promise.then(
					(value) => {
						clearTimeout(timer);
						resolve(value);
					},
					(error) => {
						clearTimeout(timer);
						reject(error);
					}
				);
			});
		}
	};
}
