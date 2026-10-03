import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { containerLabel, sandboxConfig } from './config';
import { createEngine } from './engine';
import { createHttpRunner } from './http-adapter';
import type { RunnerPort } from './port';

/**
 * Seam 2, adversarial: real learner Python through the HTTP adapter and a real Runner process,
 * against real Docker. Each test asserts only on what the learner's run observably returns.
 */

const token = 'escape-test-token-0123456789-abcdef';
const socket = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const engine = createEngine(socket);
let runnerProcess: ChildProcess;
let runner: RunnerPort;
let url: string;

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
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } });
			if (res.ok) break;
		} catch {
			// not listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	runner = createHttpRunner({ url, token });
	// Pull the image now so the first test does not pay for it.
	await engine.create(sandboxConfig.pythonImage, {}).then((id) => engine.remove(id));
}, 120_000);

afterAll(() => {
	runnerProcess?.kill();
});

afterEach(async () => {
	expect(await engine.listByLabel(containerLabel)).toEqual([]);
});

const limits = { timeoutMs: 2000, memoryMb: 256 };
const run = (main: string, lim = limits) =>
	runner.execute({
		language: 'python',
		files: { 'main.py': main },
		tests: [{ id: 't', input: '' }],
		limits: lim
	});
const gateway = dockerHostGateway();

/** The address of the Docker bridge on the host, which is where a container would reach the host. */
function dockerHostGateway(): string {
	try {
		const out = execFileSync(
			'docker',
			['network', 'inspect', 'bridge', '--format', '{{(index .IPAM.Config 0).Gateway}}'],
			{ encoding: 'utf8' }
		).trim();
		if (/^\d+\.\d+\.\d+\.\d+$/.test(out)) return out;
	} catch {
		// fall back to Docker's default bridge gateway
	}
	return '172.17.0.1';
}

const lines = (s: string) => s.split('\n').filter(Boolean);

describe('Sandbox escapes: network, filesystem, identity', { timeout: 60_000 }, () => {
	it('cannot open a connection to the internet, the Docker host gateway or DNS', async () => {
		const probe = [
			'import socket',
			`targets = [("1.1.1.1", 53), ("${gateway}", 22), ("${gateway}", 2375), ("127.0.0.1", 80)]`,
			'for host, port in targets:',
			'    try:',
			'        socket.create_connection((host, port), timeout=1)',
			'        print("connected", host, port)',
			'    except OSError:',
			'        print("blocked", host, port)',
			'try:',
			'    socket.getaddrinfo("example.com", 80)',
			'    print("dns resolved")',
			'except OSError:',
			'    print("dns blocked")',
			''
		].join('\n');

		const result = await run(probe);

		expect(result.results[0].stderr).toBe('');
		expect(lines(result.results[0].stdout)).toEqual([
			'blocked 1.1.1.1 53',
			`blocked ${gateway} 22`,
			`blocked ${gateway} 2375`,
			'blocked 127.0.0.1 80',
			'dns blocked'
		]);
	});

	it('cannot write anywhere outside /work: /, /tmp, /usr and /etc', async () => {
		const probe = [
			'import os',
			'for path in ("/escape", "/tmp/escape", "/usr/escape", "/etc/escape", "/usr/local/escape", "/proc/escape", "/sys/escape"):',
			'    try:',
			'        open(path, "w").write("x")',
			'        print("wrote", path)',
			'    except OSError:',
			'        print("denied", path)',
			'open("/work/control", "w").write("x")',
			'print("wrote /work/control")',
			'for path in ("/escape-dir", "/tmp/escape-dir"):',
			'    try:',
			'        os.mkdir(path)',
			'        print("made", path)',
			'    except OSError:',
			'        print("denied", path)',
			''
		].join('\n');

		const result = await run(probe);

		expect(result.results[0].stderr).toBe('');
		expect(lines(result.results[0].stdout)).toEqual([
			'denied /escape',
			'denied /tmp/escape',
			'denied /usr/escape',
			'denied /etc/escape',
			'denied /usr/local/escape',
			'denied /proc/escape',
			'denied /sys/escape',
			'wrote /work/control',
			'denied /escape-dir',
			'denied /tmp/escape-dir'
		]);
	});

	it('cannot mount a filesystem, remount the root writable or chroot', async () => {
		const probe = [
			'import ctypes, os',
			'libc = ctypes.CDLL(None, use_errno=True)',
			'rc = libc.mount(b"tmpfs", b"/tmp", b"tmpfs", 0, None)',
			'print("mount", "denied" if rc != 0 else "allowed")',
			'rc = libc.mount(None, b"/", None, 32, None)',
			'print("remount", "denied" if rc != 0 else "allowed")',
			'try:',
			'    os.chroot("/work")',
			'    print("chroot allowed")',
			'except OSError:',
			'    print("chroot denied")',
			''
		].join('\n');

		const result = await run(probe);

		expect(lines(result.results[0].stdout)).toEqual([
			'mount denied',
			'remount denied',
			'chroot denied'
		]);
	});

	it('runs as uid 65534 with no capabilities and no way to gain any', async () => {
		const probe = [
			'import os',
			'status = dict(l.split(":\\t", 1) for l in open("/proc/self/status").read().splitlines() if ":\\t" in l)',
			'print("uid", os.getuid(), os.geteuid())',
			'for key in ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"):',
			'    print(key, status[key].strip())',
			'print("nnp", status["NoNewPrivs"].strip())',
			'try:',
			'    os.setuid(0)',
			'    print("became root")',
			'except OSError:',
			'    print("stayed non-root")',
			''
		].join('\n');

		const result = await run(probe);

		expect(result.results[0].stderr).toBe('');
		expect(lines(result.results[0].stdout)).toEqual([
			'uid 65534 65534',
			'CapInh 0000000000000000',
			'CapPrm 0000000000000000',
			'CapEff 0000000000000000',
			'CapBnd 0000000000000000',
			'CapAmb 0000000000000000',
			'nnp 1',
			'stayed non-root'
		]);
	});

	it('has no Docker socket inside the container', async () => {
		const probe = [
			'import os',
			'for path in ("/var/run/docker.sock", "/run/docker.sock", "/docker.sock"):',
			'    print(path, os.path.exists(path))',
			'mounts = open("/proc/self/mountinfo").read()',
			'print("mounted", "docker.sock" in mounts)',
			'print("DOCKER_HOST", os.environ.get("DOCKER_HOST"))',
			''
		].join('\n');

		const result = await run(probe);

		expect(lines(result.results[0].stdout)).toEqual([
			'/var/run/docker.sock False',
			'/run/docker.sock False',
			'/docker.sock False',
			'mounted False',
			'DOCKER_HOST None'
		]);
	});
});

describe('Sandbox escapes: one Test to the next', { timeout: 60_000 }, () => {
	it('cannot carry a hidden Test input to a later Test through System V IPC, shared memory or POSIX queues', async () => {
		const main = [
			'import ctypes, os, struct, sys',
			'libc = ctypes.CDLL(None, use_errno=True)',
			'data = sys.stdin.read()',
			'KEY = 0x5ec2e7',
			'qid = libc.msgget(KEY, 0o1666)',
			'if data == "first":',
			'    buf = ctypes.create_string_buffer(struct.pack("l", 1) + b"SECRET-ipc".ljust(32, b"\\0"))',
			'    libc.msgsnd(qid, buf, 32, 0)',
			'    sem = libc.semget(KEY, 1, 0o1666 | 0o1000)',
			'    libc.semctl(sem, 0, 16, ctypes.c_int(7777))',
			'    mq = libc.mq_open(b"/secret-mq", os.O_CREAT | os.O_RDWR, 0o666, None)',
			'    libc.mq_send(mq, b"SECRET-mq", 9, 0)',
			'    shm = libc.shmget(KEY, 4096, 0o1666 | 0o1000)',
			'    libc.shmat.restype = ctypes.c_void_p',
			'    addr = libc.shmat(shm, None, 0)',
			'    if shm >= 0 and addr:',
			'        ctypes.memmove(addr, b"SECRET-shm", 10)',
			'else:',
			'    buf = ctypes.create_string_buffer(8 + 32)',
			'    got = libc.msgrcv(qid, buf, 32, 0, 0o4000)',
			'    print("queue", got, buf.raw[8:18])',
			'    shm = libc.shmget(KEY, 4096, 0o1666)',
			'    print("shm", shm)',
			'    if shm >= 0:',
			'        libc.shmat.restype = ctypes.c_void_p',
			'        addr = libc.shmat(shm, None, 0)',
			'        print("shm data", ctypes.string_at(addr, 10))',
			'    sem = libc.semget(KEY, 1, 0o666)',
			'    print("sem", sem, libc.semctl(sem, 0, 12, ctypes.c_int(0)) if sem >= 0 else None)',
			'    mq = libc.mq_open(b"/secret-mq", os.O_RDWR, 0o666, None)',
			'    mbuf = ctypes.create_string_buffer(8192)',
			'    print("mq", mq, libc.mq_receive(mq, mbuf, 8192, None) if mq >= 0 else None, mbuf.value)',
			'    print("mqueue", os.listdir("/dev/mqueue") if os.path.isdir("/dev/mqueue") else None)',
			'    for name in os.listdir("/dev/shm") if os.path.isdir("/dev/shm") else []:',
			'        print("dev/shm", name)',
			''
		].join('\n');

		const result = await runner.execute({
			language: 'python',
			files: { 'main.py': main },
			tests: [
				{ id: 'first', input: 'first' },
				{ id: 'second', input: 'second' }
			],
			limits
		});

		expect(result.results[1].status).toBe('ok');
		expect(result.results[1].stdout).not.toContain('SECRET');
		expect(result.results[1].stdout).not.toContain('7777');
		expect(result.results[1].stdout).not.toContain('secret-mq');
	});
});

describe('Runner: repeated runs', { timeout: 120_000 }, () => {
	it('answers 40 sequential runtime-error requests with a verdict each, never a 500', async () => {
		const statuses: string[] = [];
		for (let i = 0; i < 40; i++) {
			const result = await run('raise ValueError("boom")\n').catch((e: Error) => e.message);
			statuses.push(typeof result === 'string' ? result : result.results[0].status);
		}

		expect(statuses).toEqual(Array(40).fill('runtimeError'));
	});
});

describe('Sandbox escapes: resource exhaustion', { timeout: 60_000 }, () => {
	const healthy = async () => {
		const next = await run('print("still serving")\n');
		expect(next.results).toEqual([
			{ id: 't', status: 'ok', stdout: 'still serving\n', stderr: '' }
		]);
	};

	it('kills a memory hog as a runtime error, not a hang, and serves the next request', async () => {
		const hog = [
			'chunks = []',
			'while True:',
			'    chunks.append(bytearray(32 * 1024 * 1024))',
			// Touch every page so the memory is really committed.
			'    chunks[-1][::4096] = b"x" * len(chunks[-1][::4096])',
			''
		].join('\n');
		const started = Date.now();

		const result = await run(hog, limits);

		expect(result.results[0].status).toBe('runtimeError');
		expect(Date.now() - started).toBeLessThan(sandboxConfig.containerTimeoutMs);
		await healthy();
	});

	it('cannot ask for more memory than the Runner allows', async () => {
		const hog =
			'data = bytearray(400 * 1024 * 1024)\nfor i in range(0, len(data), 4096):\n    data[i] = 1\nprint("allocated")\n';

		const result = await run(hog, { timeoutMs: 2000, memoryMb: 4096 });

		expect(result.results[0].status).toBe('runtimeError');
		expect(result.results[0].stdout).toBe('');
		await healthy();
	});

	it('stops a fork bomb at the pids limit, within the time limit, and serves the next request', async () => {
		const bomb = [
			'import os, time',
			'children = 0',
			'try:',
			'    while True:',
			'        if os.fork() == 0:',
			'            time.sleep(30)',
			'            os._exit(0)',
			'        children += 1',
			'except OSError:',
			`    print("limited", children <= ${sandboxConfig.pidsLimit}, children)`,
			''
		].join('\n');
		const started = Date.now();

		const result = await run(bomb);

		const [, withinLimit, forked] = result.results[0].stdout.trim().split(' ');
		expect(withinLimit).toBe('True');
		expect(Number(forked)).toBeGreaterThan(10);
		expect(Date.now() - started).toBeLessThan(sandboxConfig.containerTimeoutMs);
		await healthy();
	});

	it('ends a bomb that forks without bound within the time limit, as a verdict or a refusal', async () => {
		const bomb = 'import os\nwhile True:\n    os.fork()\n';
		const started = Date.now();

		// The container may run out of memory before the pids limit bites and take the harness down
		// with it. The Runner then refuses the request (HTTP 500) rather than trusting the output;
		// either ending is safe, a hang is not.
		const outcome = await run(bomb).then(
			(result) => result.results[0].status,
			(error: Error) => error.message
		);

		expect(['timeout', 'runtimeError', 'Runner responded 500']).toContain(outcome);
		expect(Date.now() - started).toBeLessThan(sandboxConfig.containerTimeoutMs + 5000);
		await healthy();
	});
});
