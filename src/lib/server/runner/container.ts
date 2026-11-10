/**
 * Runs one container from creation to removal and says how it ended. Callers give it an image, a
 * container spec, the bytes for stdin and a sink for the output frames; it owns the rest of the
 * lifecycle: the name the container is created under, the cleanup by that name after a create
 * that failed, the wall-clock hard stop, the order of wait, attach and start, the wait for the
 * exit status, and a removal that is always tried.
 */
import { randomBytes } from 'node:crypto';
import { sandboxConfig } from './config';
import {
	type AttachedContainer,
	type ContainerSpec,
	type Engine,
	ImageMissingError,
	NameConflictError
} from './engine';

/** How a container ended: it exited, the Runner's clock stopped it, or it printed more than the sink accepts. */
export type ContainerEnd =
	| { kind: 'exited'; code: number }
	| { kind: 'hardStop' }
	| { kind: 'overflow' };

const removeAttempts = 3;
/** Three attempts at this each, plus the pauses between them, keep the whole cleanup under about 30 s. */
export const removeAttemptTimeoutMs = 9_000;

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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retries, logs, never throws: it runs while the real error is already on its way. */
export async function removeContainer(engine: Engine, id: string): Promise<void> {
	for (let attempt = 1; attempt <= removeAttempts; attempt++) {
		try {
			await deadline(removeAttemptTimeoutMs).bound(
				engine.remove(id),
				`Docker remove of ${id} timed out`
			);
			return;
		} catch (error) {
			console.error(
				`Could not remove container ${id} (attempt ${attempt}/${removeAttempts})`,
				error
			);
			if (attempt < removeAttempts) await sleep(200 * attempt);
		}
	}
}

/** Pauses before each try at removing a container by the name it was created under. */
const removeByNamePausesMs = [0, 50, 100, 250, 500, 1_000, 2_000];
/** One last try, in the background, for a daemon that is still stuck in the create after all of those. */
const removeByNameLateMs = 30_000;
/** Longest one try at it may take. */
const removeByNameAttemptMs = 4_000;
/** Longest the whole cleanup may take, tries and pauses together: a 404 that takes 4 s is not retried for ever. */
const removeByNameTotalMs = 8_000;
/** Most late removes waiting at once, per Engine: a daemon that is down fails every Run fast, and each would leave a timer. */
const maxPendingLateRemoves = 64;
const pendingLateRemoves = new WeakMap<Engine, number>();

/**
 * Removes the container a timed-out create may have made, by the name this Run gave it. The
 * daemon can still be finishing that create when we ask, and until it has registered the name a
 * remove answers 404 (measured on real Docker: the first remove 404s, one ~35 ms later finds it).
 * So a 404 is retried, but all tries together stop after `removeByNameTotalMs`; an error or a
 * stalled daemon ends the tries at the first one. Best effort: logs, never throws.
 */
async function removeCreatedByName(engine: Engine, name: string): Promise<void> {
	const total = deadline(removeByNameTotalMs);
	for (const pause of removeByNamePausesMs) {
		if (pause > 0 && total.left() > 0) await sleep(Math.min(pause, total.left()));
		if (total.left() <= 0) break;
		try {
			if (
				(await total.bound(
					engine.remove(name),
					`Docker remove of ${name} timed out`,
					removeByNameAttemptMs
				)) !== false
			)
				return;
		} catch (error) {
			// A stalled or failing daemon (likely why the create timed out) will not answer a retry
			// either: stop at once. The background try below and the sweep are what is left.
			console.error(`Could not remove container ${name} after a failed create`, error);
			break;
		}
	}
	// Still nothing: the daemon may be stuck in the create. One more try later, off this Run, so it
	// holds no Run slot; if that misses too, the next instance's sweep removes it by age. Capped, so
	// a stream of failing Runs cannot pile up timers; past the cap the sweep is the only backstop.
	const pending = pendingLateRemoves.get(engine) ?? 0;
	if (pending >= maxPendingLateRemoves) return;
	pendingLateRemoves.set(engine, pending + 1);
	const late = setTimeout(() => {
		// Counted until the engine's own remove settles (every engine call has a deadline), not
		// until the timer fires or a bound gives up on it: the request is still out until then.
		engine
			.remove(name)
			.catch(() => {})
			.finally(() => pendingLateRemoves.set(engine, (pendingLateRemoves.get(engine) ?? 1) - 1));
	}, removeByNameLateMs);
	late.unref?.();
}

export type ContainerRun = {
	/** Labels the container's name, so a Run's name clashes with no other instance's. */
	instanceId: string;
	image: string;
	spec: ContainerSpec;
	/** Written to the container's stdin as soon as it starts. */
	input: Uint8Array;
	/** Gets each output frame; answers false to refuse it (too much output), which ends the Run as an overflow. */
	frame: (stream: 1 | 2, payload: Buffer) => boolean;
	/** Replace the spec's command or environment. */
	override?: { Cmd?: string[]; Env?: string[] };
	/** Called when the daemon does not have the image. */
	onImageMissing?: () => void;
};

/**
 * Creates, starts and removes one container, feeding `run.input` to it and its output to `run.frame`.
 * Resolves with how it ended; rejects when it could not be run at all. The container is removed
 * either way.
 */
export async function runContainer(engine: Engine, run: ContainerRun): Promise<ContainerEnd> {
	// Two keys taken by name: an override can neither swap the image's flags nor unset them.
	const spec = {
		...run.spec,
		Cmd: run.override?.Cmd ?? run.spec.Cmd,
		Env: run.override?.Env ?? run.spec.Env
	};
	// Named on our side: if the create call times out while the daemon completes it, the reply is
	// lost but the name is not, and this Run can remove exactly that container. Random, so it
	// clashes with no other Run's.
	const name = `bl-${run.instanceId}-${randomBytes(8).toString('hex')}`;
	let id: string;
	try {
		id = await engine.create(run.image, spec, name);
	} catch (error) {
		if (error instanceof ImageMissingError) {
			// The image vanished after its Language went ready. A 404 made no container.
			run.onImageMissing?.();
		} else if (!(error instanceof NameConflictError)) {
			// (A name clash means the name is taken by a container that is not ours to remove.)
			// A create that timed out (or failed after the daemon began it) may still have made
			// the container, in the Created state, which AutoRemove never touches. Remove this Run's
			// own name, never a prefix or a label; a 404 means nothing was made. Best effort.
			await removeCreatedByName(engine, name);
		}
		throw error;
	}
	let overflow = false;
	let hardStopped = false;
	let attached: AttachedContainer | undefined;
	// The wall clock covers attach and start-up too: it starts as soon as the container exists.
	const hardStop = setTimeout(() => {
		hardStopped = true;
		// Not awaited and never throws, but not silent: a kill that fails or takes seconds is what
		// holds up the forced remove (docs/research/fork-bomb-teardown.md).
		const killStarted = performance.now();
		engine
			.kill(id)
			.then(
				() =>
					console.warn(
						`Kill of container ${id} answered after ${Math.round(performance.now() - killStarted)} ms`
					),
				(error) => console.error(`Could not kill container ${id}`, error)
			)
			.catch(() => {});
		attached?.destroy();
	}, sandboxConfig.containerTimeoutMs);
	try {
		// Registered before start, so the exit status is ours even if the container removes itself.
		const { status: exitStatus } = await engine.wait(id);
		attached = await engine.attach(
			id,
			(stream, payload) => {
				if (!overflow && !run.frame(stream, payload)) {
					overflow = true;
					attached?.destroy();
				}
			},
			sandboxConfig.attachTimeoutMs
		);
		if (hardStopped) throw new Error('Sandbox start-up exceeded the time limit');
		await engine.start(id);
		attached.sendInput(run.input);
		await attached.closed;
		if (overflow) return { kind: 'overflow' };
		if (hardStopped) return { kind: 'hardStop' };
		const code = await deadline(sandboxConfig.exitStatusTimeoutMs).bound(
			exitStatus,
			'Timed out waiting for the Sandbox exit'
		);
		return { kind: 'exited', code };
	} finally {
		clearTimeout(hardStop);
		attached?.destroy();
		await removeContainer(engine, id);
	}
}
