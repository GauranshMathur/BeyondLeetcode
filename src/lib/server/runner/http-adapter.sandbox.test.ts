import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { containerLabel, sandboxConfig } from './config';
import { type ContractSubject, type ProgramKind, runnerContract } from './contract';
import { createEngine } from './engine';
import { createHttpRunner } from './http-adapter';
import type { ExecuteRequest, RunnerPort } from './port';
import { containerSpec } from './sandbox';
import { createTar } from './tar';

/** Real HTTP adapter, real Runner process (started as `runner` role would), real Docker. */

const token = 'sandbox-test-token-0123456789-abcdef';
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
			const res = await fetch(`${url}/health`, {
				headers: { Authorization: `Bearer ${token}` }
			});
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
	runner.execute({
		language: 'python',
		files,
		tests,
		limits: lim
	} satisfies ExecuteRequest);

describe('Runner: python in a fresh Sandbox per run', { timeout: 60_000 }, () => {
	it('returns the output of correct code', async () => {
		const result = await run({ 'main.py': 'a, b = map(int, input().split())\nprint(a + b)\n' }, [
			{ id: 't', input: '2 3\n' }
		]);

		expect(result).toEqual({
			results: [{ id: 't', status: 'ok', stdout: '5\n', stderr: '' }]
		});
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
		expect(result.results[0]).toMatchObject({
			status: 'ok',
			stdout: 'fine\n'
		});
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
		const tests = Array.from({ length: 8 }, (_, i) => ({
			id: `t${i}`,
			input: ''
		}));
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

	it('keeps learner code away from the harness result channel', async () => {
		const probe = [
			'import os, signal',
			'try:',
			'    open("/proc/1/fd/1", "w")',
			'    print("forgeable")',
			'except OSError:',
			'    print("protected")',
			'os.kill(1, signal.SIGINT)',
			'print("harness alive")',
			''
		].join('\n');

		const result = await run({ 'main.py': probe });

		expect(result.results).toEqual([
			{
				id: 't',
				status: 'ok',
				stdout: 'protected\nharness alive\n',
				stderr: ''
			}
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

/** Drives the harness container directly, so a test can change its env or read its exit status. */
async function runHarness(
	files: Record<string, string>,
	inputs: string[],
	env: Record<string, string> = {}
) {
	const spec = containerSpec('test-instance', inputs.length, 2000, 256);
	const merged = [
		...spec.Env.filter((e) => !(e.split('=')[0] in env)),
		...Object.entries(env).map(([k, v]) => `${k}=${v}`)
	];
	const id = await engine.create(sandboxConfig.pythonImage, {
		...spec,
		Env: merged
	});
	const { status: exit } = await engine.wait(id);
	let out = '';
	const conn = await engine.attach(
		id,
		(stream, payload) => {
			if (stream === 1) out += payload.toString('utf8');
		},
		5000
	);
	await engine.start(id);
	const tar = createTar([
		...Object.entries(files).map(([path, content]) => ({
			path: `build/${path}`,
			content
		})),
		...inputs.map((input, i) => ({ path: `tests/${i}.in`, content: input }))
	]);
	conn.sendInput(Buffer.concat([Buffer.from(`${tar.length}\n`), tar]));
	await conn.closed;
	const status = await exit;
	await engine.remove(id);
	const lines = out
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l));
	return { status, lines };
}

describe('Runner: the harness cannot be hijacked by learner code', { timeout: 60_000 }, () => {
	it('does not let a learner-written traceback.py forge results after tests/N.in is deleted', async () => {
		const forged =
			'import json, sys\nfor i in (0, 1):\n    sys.stdout.write(json.dumps({"i": i, "status": "ok", "stdout": "FORGED", "stderr": ""}) + "\\n")\n';
		const main = [
			'import os',
			`open("/work/build/traceback.py", "w").write(${JSON.stringify(forged)})`,
			'for n in (1, 2):',
			'    try:',
			'        os.remove("/work/tests/%d.in" % n)',
			'    except OSError:',
			'        pass',
			''
		].join('\n');

		const result = await run({ 'main.py': main }, [
			{ id: 'a', input: '' },
			{ id: 'b', input: '' },
			{ id: 'c', input: '' }
		]);

		expect(JSON.stringify(result)).not.toContain('FORGED');
		expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
	});

	it('is not aborted by learner code signalling PID 1', async () => {
		const main = 'import os, signal\nos.kill(1, signal.SIGALRM)\nprint("still here")\n';

		const result = await run({ 'main.py': main });

		expect(result.results).toEqual([{ id: 't', status: 'ok', stdout: 'still here\n', stderr: '' }]);
	});

	it('kills every process a Test left behind, even ones that detached', async () => {
		const first = [
			'import os, time',
			'if os.fork() == 0:',
			'    os.setsid()',
			'    if os.fork() == 0:',
			'        time.sleep(1)',
			'        open("/work/survivor", "w").write("alive")',
			'    os._exit(0)',
			''
		].join('\n');
		const main = `import os, sys, time\nif sys.stdin.read() == "first":\n${first
			.split('\n')
			.map((l) => `    ${l}`)
			.join('\n')}\nelse:\n    time.sleep(1.5)\n    print(os.path.exists("/work/survivor"))\n`;

		const result = await run({ 'main.py': main }, [
			{ id: 'first', input: 'first' },
			{ id: 'second', input: 'second' }
		]);

		expect(result.results[1]).toMatchObject({
			status: 'ok',
			stdout: 'False\n'
		});
	});

	it('does not leak any Test input to learner code, not from /work/tests nor via files a Test left behind', async () => {
		const main = [
			'import os, sys',
			'data = sys.stdin.read()',
			'for root, _, names in os.walk("/work"):',
			'    for name in names:',
			'        path = os.path.join(root, name)',
			'        if path != "/work/build/main.py":',
			'            print(path, open(path, "rb").read().decode("utf-8", "replace"))',
			'for where in ("/work/stash", "/work/build/stash", "/work/tests/stash"):',
			'    try:',
			'        open(where, "w").write(data)',
			'    except OSError:',
			'        pass',
			''
		].join('\n');

		const result = await run({ 'main.py': main }, [
			{ id: 'hidden', input: 'SECRET-hidden-input' },
			{ id: 'example-1', input: 'SECRET-example-one' },
			{ id: 'example-2', input: 'SECRET-example-two' }
		]);

		expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
		for (const r of result.results) {
			expect(r.stdout + r.stderr).not.toContain('SECRET');
			expect(r.stdout).toBe('');
		}
	});

	it('survives learner code that locks /work or nests directories deeply, and carries nothing over in /work metadata', async () => {
		const main = [
			'import os, sys',
			'data = sys.stdin.read()',
			'seen = []',
			'try:',
			'    seen.append(str(os.stat("/work").st_mtime))',
			'    seen.append(repr(os.listxattr("/work")))',
			'    seen.append(oct(os.stat("/work").st_mode & 0o777))',
			'except OSError as e:',
			'    seen.append("err")',
			'print(*seen)',
			'os.makedirs("/work/deep", exist_ok=True)',
			'os.chdir("/work/deep")',
			'for _ in range(1500):',
			'    os.mkdir("a")',
			'    os.chdir("a")',
			'os.chdir("/")',
			'try:',
			'    os.setxattr("/work", "user.stash", data.encode())',
			'except OSError:',
			'    pass',
			'os.utime("/work", (int(data[-3:]) if data[-3:].isdigit() else 7, 123456789))',
			'os.chmod("/work", 0)',
			''
		].join('\n');

		const result = await run({ 'main.py': main }, [
			{ id: 'a', input: 'SECRET-111' },
			{ id: 'b', input: 'SECRET-222' },
			{ id: 'c', input: 'SECRET-333' }
		]);

		expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
		const outputs = result.results.map((r) => r.stdout);
		expect(outputs[1]).toBe(outputs[0]);
		expect(outputs[2]).toBe(outputs[0]);
		expect(outputs[0]).not.toContain('user.stash');
		expect(outputs[0]).not.toContain('123456789');
		expect(outputs[0]).toContain('0o700');
	});

	it('stops printing results and exits non-zero when something unexpected happens', async () => {
		// A Test input missing from the archive makes the harness fail before any learner code runs.
		const spec = containerSpec('test-instance', 2, 2000, 256);
		const id = await engine.create(sandboxConfig.pythonImage, spec);
		const { status: exit } = await engine.wait(id);
		let out = '';
		const conn = await engine.attach(
			id,
			(s, p) => {
				if (s === 1) out += p.toString();
			},
			5000
		);
		await engine.start(id);
		const tar = createTar([
			{ path: 'build/main.py', content: 'print(1)' },
			{ path: 'tests/0.in', content: '' }
		]);
		conn.sendInput(Buffer.concat([Buffer.from(`${tar.length}\n`), tar]));
		await conn.closed;

		expect(await exit).not.toBe(0);
		expect(out).toBe('');
		await engine.remove(id);
	});

	it('exits on its own at the in-container deadline if the Runner is gone', async () => {
		const started = Date.now();

		const { status, lines } = await runHarness({ 'main.py': 'while True:\n    pass\n' }, [''], {
			RUNNER_DEADLINE_S: '1',
			RUNNER_TEST_TIMEOUT_MS: '60000'
		});

		expect(status).not.toBe(0);
		expect(lines).toEqual([]);
		expect(Date.now() - started).toBeLessThan(6000);
	});

	it('gives Tests past the total output budget empty, truncated output but still runs them', async () => {
		const main = 'import sys\nsys.stdout.write("x" * 1000)\nsys.stderr.write("y" * 1000)\n';

		const { status, lines } = await runHarness({ 'main.py': main }, ['', '', '', ''], {
			RUNNER_TOTAL_OUTPUT_CAP: '3000'
		});

		expect(status).toBe(0);
		expect(lines.map((l) => [l.status, l.stdout.length > 0 && !l.stdout.startsWith('x')])).toEqual([
			['ok', false],
			['ok', false],
			['ok', true],
			['ok', true]
		]);
		expect(lines[3].stdout).toBe('\n[output truncated]');
		expect(lines[3].stderr).toBe('\n[output truncated]');
	});
});

describe('Runner: container configuration', { timeout: 60_000 }, () => {
	it('is created with AutoRemove, no IPC, no log driver and the label', async () => {
		const id = await engine.create(
			sandboxConfig.pythonImage,
			containerSpec('test-instance', 1, 2000, 256)
		);

		const { HostConfig } = await engine.inspect(id);
		await engine.remove(id);

		expect(HostConfig).toMatchObject({
			AutoRemove: true,
			IpcMode: 'none',
			LogConfig: { Type: 'none' }
		});
	});
});
