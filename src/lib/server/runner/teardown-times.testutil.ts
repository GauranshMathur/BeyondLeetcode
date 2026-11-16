import { sandboxConfig } from './config';

/** The container's own times, in ms after its create. */
export type TeardownTimes = {
	/** The create event's own time, in ms since the epoch, to put these times on another clock. */
	createdAtMs: number;
	startMs: number;
	/** The first `kill` event; none when the container ended by itself. */
	killMs?: number;
	dieMs: number;
	destroyMs?: number;
};

/** Docker's destroy event trails the remove call by event delivery and scheduling. */
export const destroySlackMs = 500;

/**
 * Reads `docker events` lines (`<action> <id> <timeNano>`) and picks the bomb container: the last
 * create at or after `sinceMs` that also started. A create that failed (an accepted outcome)
 * leaves no start, so an earlier test's container is never taken in its place. Undefined when no
 * such container exists or it has no die event.
 */
export function parseTeardownTimes(eventLines: string, sinceMs: number): TeardownTimes | undefined {
	const events = eventLines
		.split('\n')
		.filter(Boolean)
		.map((l) => {
			const [action, id, nano] = l.split(' ');
			return { action, id, ns: BigInt(nano) };
		});
	const at = (action: string, id: string) =>
		events.find((e) => e.action === action && e.id === id)?.ns;
	const sinceNs = BigInt(Math.round(sinceMs * 1e3)) * 1_000n;
	// Nanoseconds since the epoch overflow a double's precision, so the differences stay in BigInt.
	const msAfter = (later: bigint, earlier: bigint) => Number(later - earlier) / 1e6;
	const bombId = events.findLast(
		(e) => e.action === 'create' && e.ns >= sinceNs && at('start', e.id) !== undefined
	)?.id;
	if (bombId === undefined) return undefined;
	const created = at('create', bombId) as bigint;
	const started = at('start', bombId) as bigint;
	const died = at('die', bombId);
	if (died === undefined) return undefined;
	const killed = at('kill', bombId);
	const destroyed = at('destroy', bombId);
	return {
		createdAtMs: Number(created / 1_000n) / 1e3,
		startMs: msAfter(started, created),
		killMs: killed === undefined ? undefined : msAfter(killed, created),
		dieMs: msAfter(died, created),
		destroyMs: destroyed === undefined ? undefined : msAfter(destroyed, created)
	};
}

/** The bound on the hard stop: the configured stop plus a second of scheduling. */
export const hardStopBoundMs = sandboxConfig.containerTimeoutMs + 1_000;

/**
 * The Runner's hard stop sends its kill by `containerTimeoutMs` after the create call answers,
 * which is before the container starts, so counting from the start never fails a slow create reply.
 * The earlier of the first kill and the die is when the stop acted; a container alive past the
 * bound with no kill means it never fired. Returns 'pass' or a message with the numbers.
 */
export function checkHardStop(t: TeardownTimes): string {
	const stoppedMs = Math.min(t.killMs ?? Number.POSITIVE_INFINITY, t.dieMs);
	const sinceStartMs = Math.round(stoppedMs - t.startMs);
	if (sinceStartMs < hardStopBoundMs) return 'pass';
	const what = t.killMs === undefined ? 'no kill, died' : 'first kill';
	return `hard stop too late: ${what} ${sinceStartMs} ms after the start, bound ${hardStopBoundMs} ms`;
}

/** The container must be destroyed, and promptly after it died. Returns 'pass' or a message. */
export function checkRemove(t: TeardownTimes): string {
	if (t.destroyMs === undefined) return 'container not removed: no destroy event';
	const afterDieMs = Math.round(t.destroyMs - t.dieMs);
	if (afterDieMs < destroySlackMs) return 'pass';
	return `remove too slow: destroy ${afterDieMs} ms after the die, bound ${destroySlackMs} ms`;
}

/**
 * Event delivery and the clocks' rounding (the response time comes from `Date.now()`, whole ms)
 * can put the destroy event a few ms after a response that did wait for the remove. The tolerance
 * loses nothing: when the hard stop fired, a Runner that answered early leaves the destroy seconds
 * after the response; when the bomb ended by itself, Docker's AutoRemove destroys it within
 * milliseconds whether or not the Runner waited, so no tolerance could tell those apart.
 */
export const destroyBeforeResponseToleranceMs = 50;

/**
 * How many ms before the response the destroy event came, on one clock: the destroy through the
 * create event's epoch time, the response as `responseAtMs` (ms since the epoch). Negative when it
 * came after; NaN without a destroy.
 */
export function destroyMarginMs(t: TeardownTimes, responseAtMs: number): number {
	if (t.destroyMs === undefined) return Number.NaN;
	return responseAtMs - (t.createdAtMs + t.destroyMs);
}

/**
 * The Runner answers only after it has removed the container, which is what makes the whole-request
 * bound a bound on the container's life too. Passes when the destroy came less than
 * `destroyBeforeResponseToleranceMs` after the response, compared without rounding.
 * Returns 'pass' or a message with the numbers.
 */
export function checkDestroyedBeforeResponse(t: TeardownTimes, responseAtMs: number): string {
	if (t.destroyMs === undefined) return 'container not removed: no destroy event';
	const margin = destroyMarginMs(t, responseAtMs);
	if (-margin < destroyBeforeResponseToleranceMs) return 'pass';
	return `the Runner answered ${Math.round(-margin)} ms before the container was destroyed, tolerance ${destroyBeforeResponseToleranceMs} ms`;
}
