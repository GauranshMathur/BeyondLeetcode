import type { Language } from '../../languages';

const pythonImage = 'python:3.13-slim';
/** Built from Dockerfile.sandbox-node: bump the tag number by hand whenever that file changes. */
const typescriptImage = 'ghcr.io/gauranshmathur/beyondleetcode-sandbox-node:1';
/** Built from Dockerfile.sandbox-go: bump the tag number by hand whenever that file changes. */
const goImage = 'ghcr.io/gauranshmathur/beyondleetcode-sandbox-go:1';

/**
 * Longest a lifecycle call (create, start, kill, remove, wait) may wait for the daemon. An image
 * pull is not one of them: it has only an idle timeout and never runs inside a Run.
 */
export const engineCallTimeoutMs = 15_000;

/** How long the HTTP adapter waits for the Runner, per call. */
const adapterTimeoutMs = 30_000;

/**
 * Most Runner calls one Submission may make: 1 for the visible batch plus one per hidden batch. The
 * content loader refuses a Problem that needs more. The README's reverse-proxy note (C109, "up to
 * three Runner calls ... 90 s") and docs/module-map.md rest on the same number, so changing it here
 * must change them too.
 */
const maxSubmitCalls = 3;

/** Margin past the calls on `runPlaceCeilingMs`, for the save and the record. */
const placeCeilingMarginMs = 10_000;

/** Every Sandbox limit lives here (ADR 0002). A request's `limits` may lower them, never raise them. */
export const sandboxConfig = {
	/** Pinned by tag, in one place. */
	pythonImage,
	/** Language to Sandbox image: the one list the Runner pulls from. */
	images: { python: pythonImage, typescript: typescriptImage, go: goImage } satisfies Record<
		Language,
		string
	>,
	/** Wall-clock limit for the whole container; unfinished Tests after it are `timeout`. */
	containerTimeoutMs: 10_000,
	/**
	 * Most hidden Tests a Submission puts in one container. The harness starts a fresh process per
	 * Test, about 0.2 s each in TypeScript whatever the code does, so 25 Tests take about 5 s of the
	 * 10 s `containerTimeoutMs`, leaving half for slow learner code and the compile step.
	 */
	hiddenBatchTests: 25,
	/** Per-Test run time. */
	testTimeoutMs: 2_000,
	memoryMb: 256,
	/** One CPU, in Docker NanoCpus. */
	nanoCpus: 1_000_000_000,
	pidsLimit: 64,
	workTmpfsMb: 64,
	/** Go only: the exec-allowed tmpfs holding the compiled binary (/work is noexec). */
	execTmpfsMb: 64,
	/** Per Test, stdout and stderr each. */
	outputCapBytes: 64 * 1024,
	/** Across all Tests of one request, stdout and stderr together; later Tests get empty, truncated output. */
	totalOutputCapBytes: 8 * 1024 * 1024,
	/**
	 * In-container deadline: PID 1 of the container exits this many seconds after it starts, so a
	 * dead Runner cannot leave it running. Longer than the hard stop, so that stays the one that fires.
	 */
	containerDeadlineS: 15,
	/** How long the Docker attach handshake may take. */
	attachTimeoutMs: 5_000,
	/** How long the Runner waits for the exit status of a container whose output has ended. */
	exitStatusTimeoutMs: 5_000,
	/** Most Tests and most Build files in one request. */
	maxTests: 200,
	maxFiles: 64,
	/** Smallest memory limit a request may ask for, in MiB. */
	minMemoryMb: 32,
	/** Largest request body the Runner accepts. */
	requestBodyMaxBytes: 2 * 1024 * 1024,
	/** Most bytes the Runner reads back from one container before it kills it. */
	containerOutputMaxBytes: 32 * 1024 * 1024,
	adapterTimeoutMs,
	maxSubmitCalls,
	/**
	 * How long a request waits for a free slot when all are taken, before the Runner answers 503
	 * "busy". A Submission makes up to `maxSubmitCalls` calls and frees a slot between them; this wait lets a later
	 * call get one instead of failing after the earlier containers already ran. Normally a call is
	 * 8 s of queue plus about 12 s of container, inside `adapterTimeoutMs`; with a slow daemon (create
	 * up to 15 s) it can pass 30 s, and the adapter then gives up on that call: no guarantee.
	 */
	queueWaitMs: 8_000,
	/** Most requests waiting for a slot; one past this gets 503 "busy" at once. */
	maxQueued: 8,
	/**
	 * Most Runs and Submits one Learner has running at once, counted together (Learning core). Each
	 * holds one Runner slot or queue place at a time (a Submit's up to `maxSubmitCalls` calls run in a row). On a
	 * 2-CPU box 2 places is every Runner slot, so the cap does not keep a Learner out of the slots: the
	 * Runner's FIFO queue hand-off (runner/server.ts) is what stops starvation of others, and the cap
	 * only keeps one Learner from also filling the queue's `maxQueued` places. The workspace already
	 * keeps one request per tab on the wire, so 2 is not for a double-click: it is for two tabs on
	 * different Problems, a no-JS double POST, and a retry while the first call still runs.
	 */
	maxRunsPerLearner: 2,
	/**
	 * Longest a Run or Submit keeps one of a Learner's places, even if its work never settles: a Submit
	 * is up to `maxSubmitCalls` calls of `adapterTimeoutMs`, plus a margin for the save and the record. Past it
	 * the place frees and the call fails as RunnerUnavailable.
	 */
	runPlaceCeilingMs: maxSubmitCalls * adapterTimeoutMs + placeCeilingMarginMs
} as const;

/** Shortest bearer token the Runner starts with. */
export const minTokenLength = 32;

/**
 * Set on every container the Runner starts, so leftovers can be found. The value is the starting
 * Runner process's instance id; containers from before instance ids carry the value `true`.
 */
export const containerLabel = 'beyondleetcode.runner';

/** The `containerLabel` value of containers made before instance ids existed. */
export const legacyContainerLabelValue = 'true';

/** Docker's list `Created` is whole seconds, so a container can look up to this much older than it is. */
const createdTruncationMs = 1_000;

/**
 * A start-up sweep removes another instance's container only once it is older than this. The
 * owner's hard stop (`containerTimeoutMs`) starts only when Docker answers the create call, which
 * may take up to `engineCallTimeoutMs`, and the listed `Created` is truncated to the second; the
 * margin sits on top of both. So no live Runner's in-flight run is touched before its hard stop.
 */
export const sweepMinAgeMs =
	engineCallTimeoutMs + sandboxConfig.containerTimeoutMs + createdTruncationMs + 5_000;

/** The Runner process's own settings, from its environment. Throws a message fit for the log. */
export function readRunnerEnv(
	env: Record<string, string | undefined>,
	defaultConcurrency: number
): {
	token: string;
	port: number;
	host: string;
	maxConcurrent: number;
	dockerSocket: string;
} {
	const token = env.RUNNER_TOKEN;
	if (!token) {
		throw new Error('RUNNER_TOKEN is not set. Every request must present it as a bearer token.');
	}
	if (token.length < minTokenLength) {
		throw new Error(`RUNNER_TOKEN must be at least ${minTokenLength} characters.`);
	}
	const port = Number(env.RUNNER_PORT);
	if (!env.RUNNER_PORT || !Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('RUNNER_PORT is not set to a port number.');
	}
	const maxConcurrent = env.RUNNER_MAX_CONCURRENT
		? Number(env.RUNNER_MAX_CONCURRENT)
		: defaultConcurrency;
	if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
		throw new Error('RUNNER_MAX_CONCURRENT must be a positive whole number.');
	}
	return {
		token,
		port,
		host: env.RUNNER_HOST || '0.0.0.0',
		maxConcurrent,
		dockerSocket: env.DOCKER_SOCKET ?? '/var/run/docker.sock'
	};
}
