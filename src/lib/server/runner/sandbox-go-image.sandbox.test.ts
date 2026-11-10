import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sandboxConfig } from './config';
import { createEngine } from './engine';
import type { RunnerPort } from './port';
import { containerSpec } from './sandbox';
import { runCaptured, startTestRunner, stopTestRunners } from './wait-healthy.testutil';

/** Real Docker: the Go Sandbox image carries the pinned Go toolchain and a pre-warmed build cache, under the Sandbox flags. */

const engine = createEngine(process.env.DOCKER_SOCKET ?? '/var/run/docker.sock');
const image = sandboxConfig.images.go;

async function runInImage(cmd: string[]): Promise<{ out: string; status: number }> {
	// create no longer pulls a missing image.
	if (!(await engine.hasImage(image))) await engine.pull(image);
	const { end, stdout } = await runCaptured(engine, {
		image,
		spec: containerSpec('go', 'test-instance', 1, 2000, 256),
		input: Buffer.alloc(0),
		override: { Cmd: cmd }
	});
	if (end.kind !== 'exited') throw new Error(`The container ended with ${end.kind}`);
	return { out: stdout.trim(), status: end.code };
}

describe('Go Sandbox image', { timeout: 120_000 }, () => {
	it('prints the pinned Go version and has a warmed, read-only cache', async () => {
		expect(await runInImage(['go', 'version'])).toMatchObject({
			out: expect.stringMatching(/^go version go1\.27\.1 linux\/(amd64|arm64)$/),
			status: 0
		});
		// The cache holds the standard packages a solution imports, and nothing can write to it.
		expect(
			await runInImage([
				'sh',
				'-c',
				'ls /opt/gocache | wc -l; touch /opt/gocache/x 2>&1 || echo ro'
			])
		).toMatchObject({ out: expect.stringMatching(/^\d{3}\n.*(Read-only|ro)/s), status: 0 });
	});
});

describe('Go Sandbox: RLIMIT_CORE', { timeout: 120_000 }, () => {
	let runner: RunnerPort;
	beforeAll(async () => {
		runner = (await startTestRunner('go-core-test-token-0123456789-abcdef', { images: [image] }))
			.runner;
	}, 120_000);
	afterAll(() => stopTestRunners());

	it('cannot lower the core limit with syscall.Setrlimit, and the limit stays (1, 1)', async () => {
		const main = [
			'package main',
			'',
			'import (',
			'\t"fmt"',
			'\t"syscall"',
			')',
			'',
			'func main() {',
			'\terr := syscall.Setrlimit(syscall.RLIMIT_CORE, &syscall.Rlimit{Cur: 0, Max: 1})',
			'\tvar got syscall.Rlimit',
			'\t_ = syscall.Getrlimit(syscall.RLIMIT_CORE, &got)',
			'\tfmt.Println(err, got.Cur, got.Max)',
			'}',
			''
		].join('\n');

		const result = await runner.execute({
			language: 'go',
			files: { 'main.go': main },
			tests: [{ id: 't', input: '' }],
			limits: { timeoutMs: 5000, memoryMb: 256 }
		});

		expect(result.results[0]).toMatchObject({
			status: 'ok',
			stdout: 'operation not permitted 1 1\n'
		});
	});
});
