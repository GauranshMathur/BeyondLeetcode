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

const harnessLine = z.union([
	z.object({ compileError: z.string() }),
	z.object({
		i: z.number().int(),
		status: z.enum(['ok', 'runtimeError', 'timeout']),
		stdout: z.string(),
		stderr: z.string()
	})
]);

function containerSpec(testCount: number, testTimeoutMs: number, memoryMb: number) {
	const memory = memoryMb * mib;
	return {
		Cmd: ['python', '-c', harnessScript],
		User: nobody,
		WorkingDir: '/work',
		Env: [
			`RUNNER_TEST_COUNT=${testCount}`,
			`RUNNER_TEST_TIMEOUT_MS=${testTimeoutMs}`,
			`RUNNER_OUTPUT_CAP=${sandboxConfig.outputCapBytes}`
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
			NetworkMode: 'none',
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
		...Object.entries(request.files).map(([path, content]) => ({ path: `build/${path}`, content })),
		...request.tests.map((test, i) => ({ path: `tests/${i}.in`, content: test.input }))
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
	try {
		attached = await engine.attach(id, (stream, payload) => {
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
		});
		const conn = attached;
		// The wall clock covers start-up too: it starts before the container does.
		const hardStop = setTimeout(() => {
			timedOut = true;
			engine.kill(id).catch(() => {});
			conn.destroy();
		}, sandboxConfig.containerTimeoutMs);
		try {
			await engine.start(id);
			conn.sendInput(Buffer.concat([Buffer.from(`${tar.length}\n`), tar]));
			await conn.closed;
		} finally {
			clearTimeout(hardStop);
		}
	} finally {
		attached?.destroy();
		await engine.remove(id);
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
			return { id: testId, status: found.status, stdout: found.stdout, stderr: found.stderr };
		if (timedOut) return { id: testId, status: 'timeout', stdout: '', stderr: '' };
		throw new Error(`Sandbox ended without a result for Test ${testId}: ${harnessStderr}`);
	});
	return { results };
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
