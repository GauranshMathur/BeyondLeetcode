/**
 * The Runner's engine room: one fresh, hardened container per request (ADR 0002), removed
 * afterwards whatever happened. Python, TypeScript and Go.
 */
import { containerLabel, legacyContainerLabelValue, sandboxConfig, sweepMinAgeMs } from './config';
import { removeContainer, runContainer } from './container';
import { type Engine, parseImageRef } from './engine';
import { createHarnessDecoder, harnessEnv, harnessInput, harnessScript } from './harness';
import type { ExecuteRequest, ExecuteResult, Language, RunnerPort } from './port';

const nobody = '65534:65534';
const mib = 1024 * 1024;

export { removeAttemptTimeoutMs } from './container';

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
		Env: harnessEnv(language, testCount, testTimeoutMs),
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
			PidsLimit: sandboxConfig.pidsLimit,
			// core_pattern is not namespaced: a crash would start the host's core-dump helper as root,
			// outside this Sandbox's cgroups. A limit of 0 is ignored for a piped helper; 1 byte is the
			// kernel's special value that skips it. CapDrop ALL stops Learner code raising the hard limit.
			// 1:1 stops a crash starting the helper only while the soft limit stays 1: Learner code can
			// still lower its own soft limit to 0, which the seccomp filter in the harness closes.
			Ulimits: [{ Name: 'core', Soft: 1, Hard: 1 }]
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

	const decoder = createHarnessDecoder(request.tests);
	const end = await runContainer(engine, {
		instanceId,
		image,
		spec: containerSpec(
			request.language,
			instanceId,
			request.tests.length,
			testTimeoutMs,
			memoryMb
		),
		input: harnessInput(
			request.files,
			request.tests.map((test) => test.input)
		),
		frame: (stream, payload) => decoder.frame(stream, payload),
		onImageMissing: () => onImageMissing?.(request.language)
	});
	return decoder.finish(end);
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
	// A malformed reference is a configuration error, not a pull failure: throw now, before any
	// loop could retry it forever (or, with an empty tag, pull every tag).
	for (const [language, image] of Object.entries(images)) {
		try {
			parseImageRef(image);
		} catch (error) {
			throw new Error(`Sandbox image for ${language} is malformed: ${(error as Error).message}`);
		}
	}
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

export function createSandboxRunner(
	engine: Engine,
	instanceId: string,
	hooks: { onImageMissing?: (language: Language) => void } = {}
): RunnerPort {
	return { execute: (request) => execute(engine, instanceId, request, hooks.onImageMissing) };
}
