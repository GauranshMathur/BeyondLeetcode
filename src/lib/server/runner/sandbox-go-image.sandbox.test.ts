import { describe, expect, it } from 'vitest';
import { sandboxConfig } from './config';
import { createEngine } from './engine';
import { containerSpec } from './sandbox';

/** Real Docker: the Go Sandbox image carries the pinned Go toolchain and a pre-warmed build cache, under the Sandbox flags. */

const engine = createEngine(process.env.DOCKER_SOCKET ?? '/var/run/docker.sock');
const image = sandboxConfig.images.go;

async function runInImage(cmd: string[]): Promise<{ out: string; status: number }> {
	const id = await engine.create(image, {
		...containerSpec('go', 'test-instance', 1, 2000, 256),
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
