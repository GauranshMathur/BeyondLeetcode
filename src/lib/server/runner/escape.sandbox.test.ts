import { execFileSync } from 'node:child_process';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { containerLabel, sandboxConfig } from './config';
import { createEngine } from './engine';
import type { Language, RunnerPort } from './port';
import { removeAttemptTimeoutMs } from './sandbox';
import { containersOwnedBy, startTestRunner, stopTestRunners } from './wait-healthy.testutil';

/**
 * Seam 2, adversarial: real learner code (mostly Python) through the HTTP adapter and a real Runner process,
 * against real Docker. Each test asserts only on what the learner's run observably returns.
 */

const token = 'escape-test-token-0123456789-abcdef';
const socket = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const engine = createEngine(socket);
let runner: RunnerPort;
let instanceId: string;

beforeAll(async () => {
	const started = await startTestRunner(token, { images: Object.values(sandboxConfig.images) });
	instanceId = started.instanceId;
	runner = started.runner;
}, 120_000);

afterAll(() => {
	stopTestRunners();
});

afterEach(async () => {
	expect(await containersOwnedBy(engine, instanceId)).toEqual([]);
});

const limits = { timeoutMs: 2000, memoryMb: 256 };
const run = (main: string, lim = limits) =>
	runner.execute({
		language: 'python',
		files: { 'main.py': main },
		tests: [{ id: 't', input: '' }],
		limits: lim
	});
const runIn = (language: Language, file: string, main: string) =>
	runner.execute({
		language,
		files: { [file]: main },
		tests: [{ id: 't', input: '' }],
		limits
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

/**
 * The bomb container's own times, in ms after its create: when it died and when Docker destroyed
 * it. The bomb container is the last this Runner instance created at or after `sinceMs` that also
 * started; undefined when Docker reported no such container or no die event.
 */
function bombContainerTimes(
	sinceMs: number
): { lifetimeMs: number; destroyMs?: number } | undefined {
	let out: string;
	try {
		out = execFileSync(
			'docker',
			[
				'events',
				'--since',
				(sinceMs / 1000).toFixed(3),
				'--until',
				String(Math.ceil(Date.now() / 1000) + 1),
				'--filter',
				'type=container',
				'--filter',
				`label=${containerLabel}=${instanceId}`,
				'--format',
				'{{.Action}} {{.ID}} {{.TimeNano}}'
			],
			{ encoding: 'utf8', timeout: 20_000 }
		);
	} catch {
		return undefined;
	}
	const events = lines(out).map((l) => {
		const [action, id, nano] = l.split(' ');
		return { action, id, ms: Number(BigInt(nano)) / 1e6 };
	});
	const at = (action: string, id: string) =>
		events.find((e) => e.action === action && e.id === id)?.ms;
	// A create that failed (an accepted outcome) leaves no start; never fall back to an earlier test's container.
	const bombId = events.findLast(
		(e) => e.action === 'create' && e.ms >= sinceMs && at('start', e.id) !== undefined
	)?.id;
	if (bombId === undefined) return undefined;
	const created = at('create', bombId) as number;
	const died = at('die', bombId);
	const destroyed = at('destroy', bombId);
	if (died === undefined) return undefined;
	return {
		lifetimeMs: died - created,
		destroyMs: destroyed === undefined ? undefined : destroyed - created
	};
}

/** Docker's destroy event trails the remove call by event delivery and scheduling. */
const destroySlackMs = 500;

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

describe('Sandbox escapes: core dumps', { timeout: 60_000 }, () => {
	it('finds RLIMIT_CORE at (1, 1), cannot raise it, and aborts without a core', async () => {
		const probe = [
			'import os, resource, signal',
			'print("limit", resource.getrlimit(resource.RLIMIT_CORE))',
			'try:',
			'    resource.setrlimit(resource.RLIMIT_CORE, (resource.RLIM_INFINITY, resource.RLIM_INFINITY))',
			'    print("raised")',
			'except (ValueError, OSError):',
			'    print("not raised")',
			'pid = os.fork()',
			'if pid == 0:',
			'    os.abort()',
			'_, status = os.waitpid(pid, 0)',
			'print("aborted", os.WIFSIGNALED(status) and os.WTERMSIG(status) == signal.SIGABRT)',
			'print("core", os.WCOREDUMP(status))',
			''
		].join('\n');

		const result = await run(probe);

		expect(result.results[0].stdout).toBe('limit (1, 1)\nnot raised\naborted True\ncore False\n');
	});

	it('cannot lower RLIMIT_CORE, by setrlimit, prlimit64 or the prlimit tool, and still aborts without a core', async () => {
		// Each attempt is followed by a fork-and-abort: the kernel reads the soft limit, so a lowered
		// one would start the host's piped core-dump helper as root again.
		const probe = [
			'import os, resource, signal, subprocess',
			'def abort_dumps():',
			'    pid = os.fork()',
			'    if pid == 0:',
			'        os.abort()',
			'    _, status = os.waitpid(pid, 0)',
			'    return os.WCOREDUMP(status)',
			'def attempt(name, lower):',
			'    try:',
			'        lower()',
			'        print(name, "lowered")',
			'    except (ValueError, OSError):',
			'        print(name, "refused")',
			'    print(name, "limit", resource.getrlimit(resource.RLIMIT_CORE), "core", abort_dumps())',
			'attempt("setrlimit(0, 1)", lambda: resource.setrlimit(resource.RLIMIT_CORE, (0, 1)))',
			'attempt("setrlimit(0, 0)", lambda: resource.setrlimit(resource.RLIMIT_CORE, (0, 0)))',
			'attempt("prlimit64", lambda: resource.prlimit(0, resource.RLIMIT_CORE, (0, 1)))',
			'def tool():',
			'    done = subprocess.run(["prlimit", "--core=0:1", "--pid", str(os.getpid())], capture_output=True)',
			'    if done.returncode == 0:',
			'        return',
			'    if b"not permitted" in done.stderr:',
			'        raise OSError("refused")',
			'    raise SystemExit("prlimit tool failed another way: " + done.stderr.decode())',
			'attempt("prlimit tool", tool)',
			''
		].join('\n');

		const result = await run(probe);

		expect(result.results[0].stdout).toBe(
			[
				'setrlimit(0, 1) refused',
				'setrlimit(0, 1) limit (1, 1) core False',
				'setrlimit(0, 0) refused',
				'setrlimit(0, 0) limit (1, 1) core False',
				'prlimit64 refused',
				'prlimit64 limit (1, 1) core False',
				'prlimit tool refused',
				'prlimit tool limit (1, 1) core False',
				''
			].join('\n')
		);
	});

	it('reports a crashing Test as a runtime error, as any crash does', async () => {
		const result = await run('import os\nos.abort()\n');

		expect(result.results[0].status).toBe('runtimeError');
	});
});

describe('Sandbox escapes: tracing', { timeout: 60_000 }, () => {
	// A tracer can change a syscall's arguments after the seccomp filter has checked them on some
	// kernels, so the filter refuses ptrace outright. PTRACE_TRACEME would succeed without it.
	const pythonProbe = [
		'import ctypes, errno',
		'libc = ctypes.CDLL(None, use_errno=True)',
		'result = libc.ptrace(0, 0, 0, 0)',
		'refused = result == -1 and ctypes.get_errno() == errno.EPERM',
		'print("ptrace", "EPERM" if refused else "allowed")',
		''
	].join('\n');

	it.each([
		['python', 'main.py', pythonProbe],
		[
			'typescript',
			'main.ts',
			// Node has no direct syscall: the probe is the image's Python, run as a child, which
			// inherits the filter.
			[
				"import { execFileSync } from 'node:child_process';",
				`const probe = ${JSON.stringify(pythonProbe)};`,
				"process.stdout.write(execFileSync('/usr/local/bin/python3', ['-I', '-c', probe]));",
				''
			].join('\n')
		],
		[
			'go',
			'main.go',
			[
				'package main',
				'',
				'import (',
				'\t"fmt"',
				'\t"syscall"',
				')',
				'',
				'func main() {',
				'\t_, _, errno := syscall.Syscall6(syscall.SYS_PTRACE, 0, 0, 0, 0, 0, 0)',
				'\tif errno == syscall.EPERM {',
				'\t\tfmt.Println("ptrace", "EPERM")',
				'\t} else {',
				'\t\tfmt.Println("ptrace", "allowed")',
				'\t}',
				'}',
				''
			].join('\n')
		]
	] as const)('refuses ptrace(PTRACE_TRACEME) with EPERM in %s', async (language, file, main) => {
		const result = await runIn(language, file, main);

		expect(result.compileError).toBeUndefined();
		expect(result.results[0].stdout).toBe('ptrace EPERM\n');
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

	it('ends a bomb that forks without bound within the design bound, as a verdict or a refusal', async () => {
		const bomb = 'import os\nwhile True:\n    os.fork()\n';
		// What the code allows: the hard stop plus two of `removeContainer`'s three attempts, each
		// giving up at removeAttemptTimeoutMs. A slower teardown is a regression, not a reason to
		// widen this.
		const designBoundMs = sandboxConfig.containerTimeoutMs + 2 * removeAttemptTimeoutMs;
		const started = Date.now();

		// The container may run out of memory before the pids limit bites and take the harness down
		// with it. The Runner then refuses the request (HTTP 500) rather than trusting the output;
		// either ending is safe, a hang is not.
		const outcome = await run(bomb).then(
			(result) => result.results[0].status,
			(error: Error) => error.message
		);
		const elapsedMs = Date.now() - started;

		// So drift shows in the CI log: the container's own lifetime, apart from create and teardown.
		const times = bombContainerTimes(started);
		const lifetimeMs = times?.lifetimeMs;
		// A broken `docker events` pairing must fail here, not print "unavailable".
		expect(lifetimeMs).toBeDefined();
		console.log(
			`fork-bomb container lifetime ${Math.round(lifetimeMs ?? Number.NaN)} ms; destroy ${Math.round(times?.destroyMs ?? Number.NaN)} ms; whole request ${elapsedMs} ms; design bound ${designBoundMs} ms; outcome ${outcome}`
		);

		expect(['timeout', 'runtimeError', 'Runner responded 500']).toContain(outcome);
		expect(elapsedMs).toBeLessThan(designBoundMs);
		// The container's own life: the hard stop plus one remove attempt. Past this, the container
		// outlived the first forced remove (#435). CI's runs so far all ended before the hard stop
		// (the kernel ended PID 1, exit 137), so this guards the hard-stop path without measuring it.
		expect(lifetimeMs).toBeLessThan(sandboxConfig.containerTimeoutMs + removeAttemptTimeoutMs);
		// The other reading of #435: the container died promptly and the daemon removed it slowly.
		expect(times?.destroyMs).toBeDefined();
		expect(times?.destroyMs).toBeLessThan(
			sandboxConfig.containerTimeoutMs + removeAttemptTimeoutMs + destroySlackMs
		);
		await healthy();
	});
});
