import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEngine } from './engine';

describe('Engine attach', () => {
	const cleanup: (() => void)[] = [];
	afterEach(() => {
		for (const fn of cleanup.splice(0)) fn();
	});

	it('gives up when the daemon accepts the connection but never answers the handshake', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'engine-'));
		const socketPath = join(dir, 'docker.sock');
		const server = createServer(() => {}).listen(socketPath);
		cleanup.push(() => {
			server.close();
			rmSync(dir, { recursive: true, force: true });
		});
		await new Promise((resolve) => server.once('listening', resolve));

		await expect(createEngine(socketPath).attach('c1', () => {}, 100)).rejects.toThrow(/timed out/);
	});
});
