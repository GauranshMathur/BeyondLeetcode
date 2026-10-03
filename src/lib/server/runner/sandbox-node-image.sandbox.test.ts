import { describe, expect, it } from 'vitest';
import { sandboxConfig } from './config';
import { createEngine } from './engine';
import { containerSpec } from './sandbox';

/** Real Docker: the TypeScript Sandbox image carries the pinned Node and tsc, under the Sandbox flags. */

const engine = createEngine(process.env.DOCKER_SOCKET ?? '/var/run/docker.sock');
const image = sandboxConfig.images.typescript;

async function runInImage(cmd: string[]): Promise<{ out: string; status: number }> {
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
