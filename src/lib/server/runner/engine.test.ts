import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEngine, engineCallTimeoutMs, ImageMissingError } from './engine';

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

	it('gives up waiting for the exit status when the daemon never answers the wait request', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'engine-'));
		const socketPath = join(dir, 'docker.sock');
		const server = createServer(() => {}).listen(socketPath);
		cleanup.push(() => {
			server.close();
			rmSync(dir, { recursive: true, force: true });
		});
		await new Promise((resolve) => server.once('listening', resolve));

		await expect(createEngine(socketPath, 100).wait('c1')).rejects.toThrow(/timed out/);
	});

	it('keeps waiting for the exit status after the daemon has acknowledged the wait', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'engine-'));
		const socketPath = join(dir, 'docker.sock');
		const server = createServer((socket) => {
			socket.once('data', () => {
				socket.write(
					'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 18\r\n\r\n'
				);
				setTimeout(() => socket.end('{"StatusCode":137}'), 400);
			});
		}).listen(socketPath);
		cleanup.push(() => {
			server.close();
			rmSync(dir, { recursive: true, force: true });
		});
		await new Promise((resolve) => server.once('listening', resolve));

		const { status } = await createEngine(socketPath, 100).wait('c1');

		expect(await status).toBe(137);
	});

	it('does not wait forever on an error reply whose body never ends', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'engine-'));
		const socketPath = join(dir, 'docker.sock');
		const server = createServer((socket) => {
			socket.once('data', () => {
				socket.write('HTTP/1.1 500 Internal Server Error\r\nContent-Length: 100\r\n\r\npartial');
			});
		}).listen(socketPath);
		cleanup.push(() => {
			server.close();
			rmSync(dir, { recursive: true, force: true });
		});
		await new Promise((resolve) => server.once('listening', resolve));

		await expect(createEngine(socketPath, 100).wait('c1')).rejects.toThrow();
	});

	it('rejects a call whose reply keeps trickling in past the deadline', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'engine-'));
		const socketPath = join(dir, 'docker.sock');
		const server = createServer((socket) => {
			socket.once('data', () => {
				socket.write('HTTP/1.1 200 OK\r\nContent-Length: 1000\r\n\r\n');
				const drip = setInterval(() => socket.write('x'), 30);
				socket.once('close', () => clearInterval(drip));
			});
		}).listen(socketPath);
		cleanup.push(() => {
			server.close();
			rmSync(dir, { recursive: true, force: true });
		});
		await new Promise((resolve) => server.once('listening', resolve));

		const started = Date.now();
		await expect(createEngine(socketPath, 200).create('img', {})).rejects.toThrow(/timed out/);
		expect(Date.now() - started).toBeLessThan(300);
	});

	it('fails a create whose image is missing at once, without asking the daemon to pull', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'engine-'));
		const socketPath = join(dir, 'docker.sock');
		const requests: string[] = [];
		const body = '{"message":"No such image: img"}';
		const server = createServer((socket) => {
			socket.on('data', (chunk) => {
				requests.push(chunk.toString('utf8').split(' ').slice(0, 2).join(' '));
				socket.write(
					`HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`
				);
			});
		}).listen(socketPath);
		cleanup.push(() => {
			server.close();
			rmSync(dir, { recursive: true, force: true });
		});
		await new Promise((resolve) => server.once('listening', resolve));

		const started = Date.now();
		await expect(createEngine(socketPath, 200).create('img:1', {})).rejects.toBeInstanceOf(
			ImageMissingError
		);

		expect(requests).toEqual(['POST /containers/create']);
		expect(Date.now() - started).toBeLessThan(200);
	});

	it('fails a lifecycle call after 15 s by default', () => {
		expect(engineCallTimeoutMs).toBe(15_000);
	});
});
