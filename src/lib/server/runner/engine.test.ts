import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	createEngine,
	engineCallTimeoutMs,
	ImageMissingError,
	NameConflictError,
	parseImageRef
} from './engine';

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

	it('names the container on our side when asked to', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'engine-'));
		const socketPath = join(dir, 'docker.sock');
		const requests: string[] = [];
		const body = '{"Id":"abc"}';
		const server = createServer((socket) => {
			socket.on('data', (chunk) => {
				requests.push(chunk.toString('utf8').split(' ')[1]);
				socket.write(`HTTP/1.1 201 Created\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
			});
		}).listen(socketPath);
		cleanup.push(() => {
			server.close();
			rmSync(dir, { recursive: true, force: true });
		});
		await new Promise((resolve) => server.once('listening', resolve));

		await createEngine(socketPath).create('img:1', {}, 'bl-i-1');

		expect(requests).toEqual(['/containers/create?name=bl-i-1']);
	});

	it('fails a lifecycle call after 15 s by default', () => {
		expect(engineCallTimeoutMs).toBe(15_000);
	});

	/** A daemon socket that runs `onRequest` for each connection, cleaned up after the test. */
	async function daemon(onRequest: (socket: import('node:net').Socket, head: string) => void) {
		const dir = mkdtempSync(join(tmpdir(), 'engine-'));
		const socketPath = join(dir, 'docker.sock');
		const server = createServer((socket) => {
			socket.on('error', () => {});
			socket.once('data', (chunk) => onRequest(socket, chunk.toString('utf8')));
		}).listen(socketPath);
		cleanup.push(() => {
			server.close();
			rmSync(dir, { recursive: true, force: true });
		});
		await new Promise((resolve) => server.once('listening', resolve));
		return socketPath;
	}

	describe('pull', () => {
		const progress = '{"status":"Downloading","progressDetail":{}}\n';

		it('abandons a pull that keeps sending progress past its absolute cap', async () => {
			const socketPath = await daemon((socket) => {
				socket.write('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n');
				const drip = setInterval(
					() => socket.write(`${progress.length.toString(16)}\r\n${progress}\r\n`),
					20
				);
				socket.once('close', () => clearInterval(drip));
			});

			const started = Date.now();
			await expect(
				createEngine(socketPath, 100, { idleMs: 5_000, maxMs: 250 }).pull('img:1')
			).rejects.toThrow(/timed out/);

			expect(Date.now() - started).toBeLessThan(450);
		});

		it('fails as soon as the stream reports an error, without reading the rest', async () => {
			let closedByUs = false;
			const socketPath = await daemon((socket) => {
				const bad = '{"errorDetail":{"message":"denied"},"error":"denied"}\n';
				socket.write('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n');
				socket.write(`${bad.length.toString(16)}\r\n${bad}\r\n`);
				socket.once('close', () => {
					closedByUs = true;
				});
				// The stream never ends.
			});

			await expect(
				createEngine(socketPath, 100, { idleMs: 5_000, maxMs: 5_000 }).pull('img:1')
			).rejects.toThrow(/pull img:1 failed/);

			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(closedByUs).toBe(true);
		});

		it('sees an error key split across two chunks', async () => {
			const socketPath = await daemon((socket) => {
				socket.write('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n');
				socket.write('7\r\n{"statu\r\n');
				// '"error"' arrives in three tiny pieces: '"er', 'ro', 'r":1'.
				setTimeout(() => socket.write('3\r\n"er\r\n'), 10);
				setTimeout(() => socket.write('2\r\nro\r\n'), 20);
				setTimeout(() => socket.write('4\r\nr":1\r\n'), 30);
			});

			await expect(createEngine(socketPath, 100).pull('img:1')).rejects.toThrow(/failed/);
		});

		it('resolves on a stream of progress that ends cleanly, and rejects a non-200 reply', async () => {
			const ok = await daemon((socket) => {
				socket.end(`HTTP/1.1 200 OK\r\nContent-Length: ${progress.length}\r\n\r\n${progress}`);
			});
			await expect(createEngine(ok).pull('img:1')).resolves.toBeUndefined();

			const bad = await daemon((socket) => {
				socket.end('HTTP/1.1 500 Internal Server Error\r\nContent-Length: 4\r\n\r\nboom');
			});
			await expect(createEngine(bad).pull('img:1')).rejects.toThrow(/failed \(500\): boom/);
		});

		it('asks the daemon for the right name and tag', async () => {
			const heads: string[] = [];
			const socketPath = await daemon((socket, head) => {
				heads.push(head.split(' ')[1]);
				socket.end('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n');
			});

			await createEngine(socketPath).pull('localhost:5000/team/img@sha256:abc');

			expect(heads).toEqual([
				'/images/create?fromImage=localhost%3A5000%2Fteam%2Fimg&tag=sha256%3Aabc'
			]);
		});
	});

	it('splits an image reference into name and tag', () => {
		expect(parseImageRef('python:3.13-slim')).toEqual({ name: 'python', tag: '3.13-slim' });
		expect(parseImageRef('python')).toEqual({ name: 'python', tag: 'latest' });
		expect(parseImageRef('host:5000/a/b')).toEqual({ name: 'host:5000/a/b', tag: 'latest' });
		expect(parseImageRef('host:5000/a/b:2')).toEqual({ name: 'host:5000/a/b', tag: '2' });
		expect(parseImageRef('python@sha256:abc')).toEqual({ name: 'python', tag: 'sha256:abc' });
		expect(parseImageRef('python:3@sha256:abc')).toEqual({ name: 'python', tag: 'sha256:abc' });
	});

	it('throws a NameConflictError when the container name is taken (409)', async () => {
		const socketPath = await daemon((socket) => {
			socket.end('HTTP/1.1 409 Conflict\r\nContent-Length: 2\r\n\r\n{}');
		});

		await expect(createEngine(socketPath).create('img:1', {}, 'bl-x')).rejects.toBeInstanceOf(
			NameConflictError
		);
	});

	it('encodes the id or name it removes, so it can never change the path', async () => {
		const heads: string[] = [];
		const socketPath = await daemon((socket, head) => {
			heads.push(head.split(' ')[1]);
			socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 2\r\n\r\n{}');
		});

		expect(await createEngine(socketPath).remove('../images/x?y')).toBe(false);

		expect(heads[0]).toBe('/containers/..%2Fimages%2Fx%3Fy?force=true&v=true');
	});
});
