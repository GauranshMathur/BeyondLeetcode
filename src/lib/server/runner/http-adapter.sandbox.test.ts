import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { containerLabel, sandboxConfig } from './config';
import { type ContractSubject, type ProgramKind, runnerContract } from './contract';
import { createEngine } from './engine';
import { createHttpRunner } from './http-adapter';
import type { ExecuteRequest, RunnerPort } from './port';

/** Real HTTP adapter, real Runner process (started as `runner` role would), real Docker. */

const token = 'sandbox-test-token';
const socket = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const engine = createEngine(socket);
let runnerProcess: ChildProcess;
let url: string;
let runner: RunnerPort;

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as { port: number };
			server.close(() => resolve(port));
		});
		server.on('error', reject);
	});
}

async function waitUntilHealthy(): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } });
			if (res.ok) return;
		} catch {
			// not listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error('Runner process did not become healthy');
}

beforeAll(async () => {
	const port = await freePort();
	url = `http://127.0.0.1:${port}`;
	runnerProcess = spawn('bun', ['src/lib/server/runner/main.ts'], {
		env: {
			...process.env,
			RUNNER_PORT: String(port),
			RUNNER_TOKEN: token,
			DOCKER_SOCKET: socket
		},
		stdio: 'inherit'
	});
	await waitUntilHealthy();
	runner = createHttpRunner({ url, token });
	// Pull the image now so the first test does not pay for it.
	await engine.create(sandboxConfig.pythonImage, {}).then((id) => engine.remove(id));
}, 120_000);

afterAll(() => {
	runnerProcess?.kill();
});

const programs: Record<Exclude<ProgramKind, 'unavailable'>, string> = {
	echo: 'import sys\nsys.stdout.write(sys.stdin.read())\n',
	mixed: [
		'import sys',
		'data = sys.stdin.read()',
		'if data == "crash":',
		'    sys.exit(1)',
		'if data == "hang":',
		'    while True:',
		'        pass',
		'sys.stdout.write(data)',
		''
	].join('\n'),
	hang: 'while True:\n    pass\n',
	doesNotCompile: 'def (:\n'
};

const subject: ContractSubject = (kind) =>
	kind === 'unavailable'
		? {
				runner: createHttpRunner({ url: 'http://127.0.0.1:1', token }),
				language: 'python',
				files: { 'main.py': '' }
			}
		: { runner, language: 'python', files: { 'main.py': programs[kind] } };

runnerContract('HTTP adapter + Runner + Docker (python)', subject);

const limits = { timeoutMs: 2000, memoryMb: 256 };
const run = (files: Record<string, string>, tests = [{ id: 't', input: '' }], lim = limits) =>
	runner.execute({ language: 'python', files, tests, limits: lim } satisfies ExecuteRequest);

describe('Runner: python in a fresh Sandbox per run', { timeout: 60_000 }, () => {
	it('returns the output of correct code', async () => {
		const result = await run({ 'main.py': 'a, b = map(int, input().split())\nprint(a + b)\n' }, [
			{ id: 't', input: '2 3\n' }
		]);

		expect(result).toEqual({ results: [{ id: 't', status: 'ok', stdout: '5\n', stderr: '' }] });
	});

	it('reports a runtime error with the traceback on stderr', async () => {
		const result = await run({ 'main.py': 'raise ValueError("boom")\n' });

		expect(result.results[0].status).toBe('runtimeError');
		expect(result.results[0].stderr).toContain('ValueError: boom');
	});

	it('reports a compile error with the compiler message and no results', async () => {
		const result = await run({ 'main.py': 'def (:\n' });

		expect(result.compileError).toContain('SyntaxError');
		expect(result.results).toEqual([]);
	});

	it('runs a Build of several files', async () => {
		const result = await run({
			'main.py': 'from util.helper import twice\nprint(twice(21))\n',
			'util/helper.py': 'def twice(n):\n    return n * 2\n'
		});

		expect(result.results[0]).toMatchObject({ status: 'ok', stdout: '42\n' });
	});

	it('compiles with the real py_compile even if the Build ships a file of that name', async () => {
		const result = await run({
			'main.py': 'print("fine")\n',
			'py_compile.py': 'raise SystemExit("shadowed")\n'
		});

		expect(result.compileError).toBeUndefined();
		expect(result.results[0]).toMatchObject({ status: 'ok', stdout: 'fine\n' });
	});

	it('times out an infinite loop within the per-Test limit, not the request timeout', async () => {
		const started = Date.now();

		const result = await run({ 'main.py': 'while True:\n    pass\n' }, undefined, {
			timeoutMs: 60_000,
			memoryMb: 256
		});

		expect(result.results[0].status).toBe('timeout');
		expect(Date.now() - started).toBeLessThan(sandboxConfig.containerTimeoutMs);
	});

	it('honours a lower per-Test limit', async () => {
		const started = Date.now();

		const result = await run({ 'main.py': 'while True:\n    pass\n' }, undefined, {
			timeoutMs: 300,
			memoryMb: 256
		});

		expect(result.results[0].status).toBe('timeout');
		expect(Date.now() - started).toBeLessThan(1900);
	});

	it('kills the container at the hard limit and times out every unfinished Test', async () => {
		const tests = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, input: '' }));
		const started = Date.now();

		const result = await run({ 'main.py': 'while True:\n    pass\n' }, tests);

		expect(result.results.map((r) => r.status)).toEqual(tests.map(() => 'timeout'));
		expect(Date.now() - started).toBeLessThan(sandboxConfig.containerTimeoutMs + 5000);
		expect(await engine.listByLabel(containerLabel)).toEqual([]);
	});

	it('runs learner code unprivileged, offline and on a read-only root', async () => {
		const probe = [
			'import os, socket',
			'status = dict(l.split(":\\t", 1) for l in open("/proc/self/status").read().splitlines() if ":\\t" in l)',
			'print("uid", os.getuid(), os.getgid())',
			'print("caps", status["CapEff"].strip())',
			'print("nnp", status["NoNewPrivs"].strip())',
			'try:',
			'    socket.create_connection(("1.1.1.1", 53), timeout=1)',
			'    print("online")',
			'except OSError:',
			'    print("offline")',
			'try:',
			'    open("/etc/x", "w")',
			'    print("root writable")',
			'except OSError:',
			'    print("root read-only")',
			'open("/work/scratch", "w").write("ok")',
			'print("work writable")',
			''
		].join('\n');

		const result = await run({ 'main.py': probe });

		expect(result.results[0].stderr).toBe('');
		expect(result.results[0].stdout.split('\n')).toEqual([
			'uid 65534 65534',
			'caps 0000000000000000',
			'nnp 1',
			'offline',
			'root read-only',
			'work writable',
			''
		]);
	});

	it('caps stdout and marks it truncated', async () => {
		const result = await run({ 'main.py': 'print("x" * 500000)\n' });

		const { stdout } = result.results[0];
		expect(result.results[0].status).toBe('ok');
		expect(stdout.startsWith('x'.repeat(1000))).toBe(true);
		expect(stdout.length).toBeLessThan(sandboxConfig.outputCapBytes + 100);
		expect(stdout.endsWith('[output truncated]')).toBe(true);
	});

	it('leaves no container behind after success, failure or timeout', async () => {
		await run({ 'main.py': 'print(1)\n' });
		await run({ 'main.py': 'raise SystemExit(3)\n' });
		await run({ 'main.py': 'def (:\n' });
		await run({ 'main.py': 'while True:\n    pass\n' });

		expect(await engine.listByLabel(containerLabel)).toEqual([]);
	});

	it('rejects with the Runner process refusing a wrong token', async () => {
		const wrong = createHttpRunner({ url, token: 'wrong' });

		await expect(
			wrong.execute({
				language: 'python',
				files: { 'main.py': '' },
				tests: [],
				limits
			})
		).rejects.toThrow(/401/);
	});
});
