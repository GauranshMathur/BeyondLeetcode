/**
 * The Runner's engine room: one fresh, hardened container per request (ADR 0002), removed
 * afterwards whatever happened. Python, TypeScript and Go.
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { containerLabel, legacyContainerLabelValue, sandboxConfig, sweepMinAgeMs } from './config';
import {
	type AttachedContainer,
	type Engine,
	ImageMissingError,
	NameConflictError
} from './engine';
import { harnessScript } from './harness';
import type { ExecuteRequest, ExecuteResult, Language, RunnerPort, TestResult } from './port';
import { createTar } from './tar';

const nobody = '65534:65534';
const mib = 1024 * 1024;
const removeAttempts = 3;
/** Three attempts at this each, plus the pauses between them, keep the whole cleanup under about 30 s. */
const removeAttemptTimeoutMs = 9_000;

const harnessLine = z.union([
	z.object({ compileError: z.string() }),
	z.object({
		i: z.number().int(),
		status: z.enum(['ok', 'runtimeError', 'timeout']),
		stdout: z.string(),
		stderr: z.string()
	})
]);

/** The Sandbox image for a Language, or undefined where the Runner has none yet. */
function imageFor(language: Language): string | undefined {
	return (sandboxConfig.images as Partial<Record<Language, string>>)[language];
}

export function containerSpec(
	language: Language,
	instanceId: string,
	testCount: number,
	testTimeoutMs: number,
	memoryMb: number
) {
	const memory = memoryMb * mib;
	return {
		Cmd: ['python', '-I', '-c', harnessScript],
		User: nobody,
		WorkingDir: '/work',
		Env: [
			`RUNNER_LANGUAGE=${language}`,
			`RUNNER_TEST_COUNT=${testCount}`,
			`RUNNER_TEST_TIMEOUT_MS=${testTimeoutMs}`,
			`RUNNER_OUTPUT_CAP=${sandboxConfig.outputCapBytes}`,
			`RUNNER_TOTAL_OUTPUT_CAP=${sandboxConfig.totalOutputCapBytes}`,
			`RUNNER_DEADLINE_S=${sandboxConfig.containerDeadlineS}`
		],
		Labels: { [containerLabel]: instanceId },
		AttachStdin: true,
		AttachStdout: true,
		AttachStderr: true,
		OpenStdin: true,
		StdinOnce: true,
		Tty: false,
		NetworkDisabled: true,
		HostConfig: {
			// Removed by the daemon on exit too, so a dead Runner leaks nothing.
			AutoRemove: true,
			NetworkMode: 'none',
			// No shared memory between the container and anything else.
			IpcMode: 'none',
			// Nothing the container prints is kept by the daemon; the Runner reads it over attach.
			LogConfig: { Type: 'none' },
			ReadonlyRootfs: true,
			Tmpfs: {
				'/work': `rw,noexec,nosuid,nodev,size=${sandboxConfig.workTmpfsMb}m,uid=65534,gid=65534,mode=0700`,
				// Go only: /work is noexec, so the compiled binary runs from here (ADR 0002).
				...(language === 'go' && {
					'/exec': `rw,exec,nosuid,nodev,size=${sandboxConfig.execTmpfsMb}m,uid=65534,gid=65534,mode=0700`
				})
			},
			CapDrop: ['ALL'],
			SecurityOpt: ['no-new-privileges'],
			Memory: memory,
			MemorySwap: memory,
			NanoCpus: sandboxConfig.nanoCpus,
			PidsLimit: sandboxConfig.pidsLimit
		}
	};
}

async function execute(
	engine: Engine,
	instanceId: string,
	request: ExecuteRequest,
	onImageMissing?: (language: Language) => void
): Promise<ExecuteResult> {
	const image = imageFor(request.language);
	if (!image) {
		throw new Error(`Language not supported by the Runner yet: ${request.language}`);
	}
	// A request may lower the limits, never raise them.
	const testTimeoutMs = Math.min(sandboxConfig.testTimeoutMs, request.limits.timeoutMs);
	const memoryMb = Math.min(sandboxConfig.memoryMb, request.limits.memoryMb);

	const tar = createTar([
		...Object.entries(request.files).map(([path, content]) => ({
			path: `build/${path}`,
			content
		})),
		...request.tests.map((test, i) => ({
			path: `tests/${i}.in`,
			content: test.input
		}))
	]);

	const lines: z.infer<typeof harnessLine>[] = [];
	const decoder = new TextDecoder();
	let partial = '';
	let harnessStderr = '';
	let received = 0;
	let overflow = false;

	// Named on our side: if the create call times out while the daemon completes it, the reply is
	// lost but the name is not, and this Run can remove exactly that container. Random, so it
	// clashes with no other Run's.
	const name = `bl-${instanceId}-${randomBytes(8).toString('hex')}`;
	let id: string;
	try {
		id = await engine.create(
			image,
			containerSpec(request.language, instanceId, request.tests.length, testTimeoutMs, memoryMb),
			name
		);
	} catch (error) {
		if (error instanceof ImageMissingError) {
			// The image vanished after its Language went ready. Fail this Run as a Runner error and
			// hand the image back to the pull loop; nothing here pulls. A 404 made no container.
			onImageMissing?.(request.language);
		} else if (!(error instanceof NameConflictError)) {
			// (A name clash means the name is taken by a container that is not ours to remove.)
			// A create that timed out (or failed after the daemon began it) may still have made
			// the container, in the Created state, which AutoRemove never touches. Remove this Run's
			// own name, never a prefix or a label; a 404 means nothing was made. Best effort.
			await removeCreatedByName(engine, name);
		}
		throw error;
	}
	let timedOut = false;
	let attached: AttachedContainer | undefined;
	// The wall clock covers attach and start-up too: it starts as soon as the container exists.
	const hardStop = setTimeout(() => {
		timedOut = true;
		engine.kill(id).catch(() => {});
		attached?.destroy();
	}, sandboxConfig.containerTimeoutMs);
	try {
		// Registered before start, so the exit status is ours even if the container removes itself.
		const { status: exitStatus } = await engine.wait(id);
		attached = await engine.attach(
			id,
			(stream, payload) => {
				received += payload.length;
				if (received > sandboxConfig.containerOutputMaxBytes) {
					overflow = true;
					attached?.destroy();
					return;
				}
				const chunk = decoder.decode(payload, { stream: true });
				if (stream === 2) {
					harnessStderr = (harnessStderr + chunk).slice(0, 4096);
					return;
				}
				partial += chunk;
				for (let end = partial.indexOf('\n'); end >= 0; end = partial.indexOf('\n')) {
					const parsed = harnessLine.safeParse(safeJson(partial.slice(0, end)));
					partial = partial.slice(end + 1);
					if (parsed.success) lines.push(parsed.data);
				}
			},
			sandboxConfig.attachTimeoutMs
		);
		if (timedOut) throw new Error('Sandbox start-up exceeded the time limit');
		await engine.start(id);
		attached.sendInput(Buffer.concat([Buffer.from(`${tar.length}\n`), tar]));
		await attached.closed;
		if (!overflow && !timedOut) {
			// The harness only exits non-zero when something went wrong inside it (or learner code
			// got to it): whatever it printed cannot be trusted.
			const code = await within(exitStatus, sandboxConfig.exitStatusTimeoutMs);
			if (code !== 0) {
				throw new Error(`Sandbox harness exited with status ${code}: ${harnessStderr}`);
			}
		}
	} finally {
		clearTimeout(hardStop);
		attached?.destroy();
		await removeContainer(engine, id);
	}

	if (overflow) throw new Error('Sandbox produced more output than the Runner allows');
	for (const line of lines) {
		if ('compileError' in line) return { compileError: line.compileError, results: [] };
	}
	const byIndex = new Map<number, Omit<TestResult, 'id'>>();
	for (const line of lines) {
		if ('i' in line && !byIndex.has(line.i)) byIndex.set(line.i, line);
	}
	const results = request.tests.map(({ id: testId }, i): TestResult => {
		const found = byIndex.get(i);
		if (found)
			return {
				id: testId,
				status: found.status,
				stdout: found.stdout,
				stderr: found.stderr
			};
		if (timedOut) return { id: testId, status: 'timeout', stdout: '', stderr: '' };
		throw new Error(`Sandbox ended without a result for Test ${testId}: ${harnessStderr}`);
	});
	return { results };
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Timed out waiting for the Sandbox exit')), ms);
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

/** Retries, logs, never throws: it runs while the real error is already on its way. */
async function removeContainer(engine: Engine, id: string): Promise<void> {
	for (let attempt = 1; attempt <= removeAttempts; attempt++) {
		try {
			await within(engine.remove(id), removeAttemptTimeoutMs);
			return;
		} catch (error) {
			console.error(
				`Could not remove container ${id} (attempt ${attempt}/${removeAttempts})`,
				error
			);
			if (attempt < removeAttempts)
				await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
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
	const started = Date.now();
	for (const pause of removeByNamePausesMs) {
		if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
		const left = removeByNameTotalMs - (Date.now() - started);
		if (left <= 0) break;
		try {
			if ((await within(engine.remove(name), Math.min(removeByNameAttemptMs, left))) !== false)
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
		pendingLateRemoves.set(engine, (pendingLateRemoves.get(engine) ?? 1) - 1);
		within(engine.remove(name), removeAttemptTimeoutMs).catch(() => {});
	}, removeByNameLateMs);
	late.unref?.();
}

/**
 * At Runner start-up: containers left by a Runner that died mid-run. Another live Runner's
 * in-flight run is never touched, so a container is removed only if it predates instance ids, or
 * belongs to another instance and is older than `sweepMinAgeMs` (create timeout, hard stop, `Created` truncation, margin). Age is the only liveness test.
 */
export async function removeStaleContainers(
	engine: Engine,
	instanceId: string,
	now = Date.now()
): Promise<void> {
	try {
		for (const { id, created, labels } of await engine.listContainers(containerLabel)) {
			const owner = labels[containerLabel];
			if (owner === instanceId) continue;
			const legacy = owner === legacyContainerLabelValue;
			if (legacy || now - created * 1000 > sweepMinAgeMs) await removeContainer(engine, id);
		}
	} catch (error) {
		console.error('Could not clean up leftover Sandbox containers', error);
	}
}

/** Once the grace period has passed, plus a margin: every container the first sweep skipped as too young is old enough. */
export const secondSweepDelayMs = sweepMinAgeMs + 2_000;

/**
 * One more `removeStaleContainers` after `secondSweepDelayMs`, for a container the start-up sweep
 * skipped as too young (a Runner died after creating it but before starting it, so neither
 * AutoRemove nor the watchdog will ever fire). Same rules as the first sweep; not periodic.
 * Resolves when that sweep is done.
 */
export async function scheduleDelayedSweep(
	engine: Engine,
	instanceId: string,
	clock: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {}
): Promise<void> {
	const sleep =
		clock.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const now = clock.now ?? Date.now;
	try {
		await sleep(secondSweepDelayMs);
		await removeStaleContainers(engine, instanceId, now());
	} catch (error) {
		console.error('Delayed Sandbox container sweep failed', error);
	}
}

const pullRetryMinMs = 1_000;
const pullRetryMaxMs = 30_000;

/**
 * Keeps every Sandbox image present, one pull loop per Language that needs one. Each Language has
 * its own loop, so one slow or failing pull never holds up another. A failed pull is logged and
 * retried with a growing pause, forever. `onReady(language)` fires as soon as that Language's image
 * is present. The loop ends when it has the image, and `missing(language)` starts it again (re-arm,
 * not a loop that runs for good): a Language whose image is there costs nothing, and a Run that
 * finds the image gone only has to say so. At most one loop runs per Language, so any number of
 * Runs reporting the same image missing start one pull. The pull never holds a Run slot.
 */
export function createImageKeeper(
	engine: Engine,
	images: Readonly<Record<string, string>>,
	options: {
		onReady?: (language: string) => void;
		/** The Language's image is gone: it is no longer ready until the loop has it again. */
		onLost?: (language: string) => void;
		sleep?: (ms: number) => Promise<void>;
	} = {}
) {
	const {
		onReady,
		onLost,
		sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))
	} = options;
	const running = new Map<string, Promise<void>>();

	function loop(language: string): Promise<void> {
		const existing = running.get(language);
		if (existing) return existing;
		const image = images[language];
		const done = (async () => {
			for (let pause = pullRetryMinMs; ; pause = Math.min(pause * 2, pullRetryMaxMs)) {
				try {
					if (!(await engine.hasImage(image))) {
						console.log(`Pulling Sandbox image ${image}`);
						await engine.pull(image);
						console.log(`Pulled Sandbox image ${image}`);
						// A pull that answered 200 is not proof: look again before saying ready.
						if (!(await engine.hasImage(image)))
							throw new Error(`Sandbox image ${image} is still missing after its pull`);
					}
					// Both happen in one tick: a `missing` call can never fall between them.
					running.delete(language);
					onReady?.(language);
					return;
				} catch (error) {
					console.error(`Could not pull Sandbox image ${image}, retrying in ${pause} ms`, error);
					await sleep(pause);
				}
			}
		})();
		running.set(language, done);
		return done;
	}

	return {
		/** Starts a loop for every Language; resolves once all of them have their image. */
		async start(): Promise<void> {
			await Promise.all(Object.keys(images).map(loop));
		},
		/** A Run found this Language's image gone. Unknown Languages are ignored. */
		missing(language: string): void {
			if (!Object.hasOwn(images, language)) return;
			onLost?.(language);
			void loop(language);
		}
	};
}

/**
 * Makes sure the engine holds every image, pulling those it lacks; resolves once all are present.
 * See `createImageKeeper` for the loop's rules.
 */
export async function ensureImages(
	engine: Engine,
	images: Readonly<Record<string, string>>,
	options: {
		onReady?: (language: string) => void;
		sleep?: (ms: number) => Promise<void>;
	} = {}
): Promise<void> {
	await createImageKeeper(engine, images, options).start();
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export function createSandboxRunner(
	engine: Engine,
	instanceId: string,
	hooks: { onImageMissing?: (language: Language) => void } = {}
): RunnerPort {
	return { execute: (request) => execute(engine, instanceId, request, hooks.onImageMissing) };
}
