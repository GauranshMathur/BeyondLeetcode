/** Every Sandbox limit lives here (ADR 0002). A request's `limits` may lower them, never raise them. */
export const sandboxConfig = {
	/** Pinned by tag, in one place. */
	pythonImage: 'python:3.13-slim',
	/** Wall-clock limit for the whole container; unfinished Tests after it are `timeout`. */
	containerTimeoutMs: 10_000,
	/** Per-Test run time. */
	testTimeoutMs: 2_000,
	memoryMb: 256,
	/** One CPU, in Docker NanoCpus. */
	nanoCpus: 1_000_000_000,
	pidsLimit: 64,
	workTmpfsMb: 64,
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
	/** Largest request body the Runner accepts. */
	requestBodyMaxBytes: 2 * 1024 * 1024,
	/** Most bytes the Runner reads back from one container before it kills it. */
	containerOutputMaxBytes: 32 * 1024 * 1024,
	/** How long the HTTP adapter waits for the Runner. */
	adapterTimeoutMs: 30_000
} as const;

/** Set on every container the Runner starts, so leftovers can be found. */
export const containerLabel = 'beyondleetcode.runner';
