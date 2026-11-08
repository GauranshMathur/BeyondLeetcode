import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sandboxConfig } from './config';
import { createEngine } from './engine';
import type { RunnerPort } from './port';
import { containerSpec } from './sandbox';
import { startTestRunner, stopTestRunners } from './wait-healthy.testutil';

/** Real Docker: the TypeScript Sandbox image carries the pinned Node and tsc, under the Sandbox flags. */

const engine = createEngine(process.env.DOCKER_SOCKET ?? '/var/run/docker.sock');
const image = sandboxConfig.images.typescript;

async function runInImage(cmd: string[]): Promise<{ out: string; status: number }> {
	// create no longer pulls a missing image (C86).
	if (!(await engine.hasImage(image))) await engine.pull(image);
	const id = await engine.create(image, {
		...containerSpec('typescript', 'test-instance', 1, 2000, 256),
		Cmd: cmd
	});
	let out = '';
	const { status: exit } = await engine.wait(id);
	const conn = await engine.attach(
		id,
		(stream, payload) => {
			if (stream === 1) out += payload.toString('utf8');
		},
		5000
	);
	await engine.start(id);
	conn.sendInput(Buffer.alloc(0));
	await conn.closed;
	return { out: out.trim(), status: await exit };
}

describe('TypeScript Sandbox image', { timeout: 120_000 }, () => {
	it('prints the pinned node and tsc versions', async () => {
		expect(await runInImage(['node', '--version'])).toEqual({
			out: 'v24.21.0',
			status: 0
		});
		expect(await runInImage(['tsc', '--version'])).toEqual({
			out: 'Version 6.0.3',
			status: 0
		});
	});
});

describe('TypeScript Sandbox: RLIMIT_CORE', { timeout: 120_000 }, () => {
	let runner: RunnerPort;
	beforeAll(async () => {
		runner = (await startTestRunner('node-core-test-token-0123456789-abcdef', { images: [image] }))
			.runner;
	}, 120_000);
	afterAll(() => stopTestRunners());

	it('cannot lower the core limit with the prlimit tool, and process.abort() leaves no core', async () => {
		const main = [
			"import { spawnSync } from 'node:child_process';",
			"const lower = spawnSync('prlimit', ['--core=0:1', '--pid', String(process.pid)], { encoding: 'utf8' });",
			"console.log('prlimit', lower.error ? 'missing' : lower.status, lower.stderr.includes('not permitted'));",
			// A fork-and-abort in Python (the image's other interpreter) reports WCOREDUMP, which Node cannot see.
			'const py = [',
			"  'import os, signal, sys',",
			"  'pid = os.fork()',",
			"  'if pid == 0: os.execv(sys.argv[1], [sys.argv[1], \\'-e\\', \\'process.abort()\\'])',",
			"  '_, status = os.waitpid(pid, 0)',",
			"  'print(os.WTERMSIG(status) == signal.SIGABRT, os.WCOREDUMP(status))'",
			"].join('\\n');",
			"const abort = spawnSync('python3', ['-c', py, process.execPath], { encoding: 'utf8' });",
			"console.log('abort', abort.stdout.trim());",
			''
		].join('\n');

		const result = await runner.execute({
			language: 'typescript',
			files: { 'main.ts': main },
			tests: [{ id: 't', input: '' }],
			limits: { timeoutMs: 10000, memoryMb: 256 }
		});

		expect(result.compileError).toBeUndefined();
		expect(result.results[0]).toMatchObject({
			status: 'ok',
			stdout: 'prlimit 1 true\nabort True False\n'
		});
	});
});
