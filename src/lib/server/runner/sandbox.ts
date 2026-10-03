/**
 * The Runner's engine room: one fresh, hardened container per request (ADR 0002), removed
 * afterwards whatever happened. Python only for now; Node and Go arrive with their own cards.
 */
import { z } from 'zod';
import { containerLabel, sandboxConfig } from './config';
import type { AttachedContainer, Engine } from './engine';
import { harnessScript } from './harness';
import type { ExecuteRequest, ExecuteResult, RunnerPort, TestResult } from './port';
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

export function containerSpec(testCount: number, testTimeoutMs: number, memoryMb: number) {
	const memory = memoryMb * mib;
	return {
		Cmd: ['python', '-I', '-c', harnessScript],
		User: nobody,
		WorkingDir: '/work',
		Env: [
			`RUNNER_TEST_COUNT=${testCount}`,
			`RUNNER_TEST_TIMEOUT_MS=${testTimeoutMs}`,
			`RUNNER_OUTPUT_CAP=${sandboxConfig.outputCapBytes}`,
			`RUNNER_TOTAL_OUTPUT_CAP=${sandboxConfig.totalOutputCapBytes}`,
			`RUNNER_DEADLINE_S=${sandboxConfig.containerDeadlineS}`
		],
		Labels: { [containerLabel]: 'true' },
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
				'/work': `rw,noexec,nosuid,nodev,size=${sandboxConfig.workTmpfsMb}m,uid=65534,gid=65534,mode=0700`
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

async function execute(engine: Engine, request: ExecuteRequest): Promise<ExecuteResult> {
	if (request.language !== 'python') {
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

	const id = await engine.create(
		sandboxConfig.pythonImage,
		containerSpec(request.tests.length, testTimeoutMs, memoryMb)
	);
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

/** At Runner start-up: containers left by a previous Runner that died mid-run. */
export async function removeStaleContainers(engine: Engine): Promise<void> {
	try {
		for (const id of await engine.listByLabel(containerLabel)) await removeContainer(engine, id);
	} catch (error) {
		console.error('Could not clean up leftover Sandbox containers', error);
	}
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export function createSandboxRunner(engine: Engine): RunnerPort {
	return { execute: (request) => execute(engine, request) };
}
