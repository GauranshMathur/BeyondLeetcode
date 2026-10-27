/**
 * Run under Bun (`bun run test:bun`), not vitest: vitest runs under Node, where a destroyed request
 * emits 'error'. On Bun 1.2.19, the production runtime, `req.destroy(err)` does not (#284), so a call
 * that relied on it never settled. This script holds the engine to its call timeout on the real runtime.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngine, ImageMissingError } from './engine';

const timeoutMs = 300;
const slackMs = 100;

const dir = mkdtempSync(join(tmpdir(), 'engine-bun-'));
const socketPath = join(dir, 'docker.sock');
// Accepts the connection and never answers.
const server = createServer(() => {}).listen(socketPath);
await new Promise((resolve) => server.once('listening', resolve));

const trickleSocketPath = join(dir, 'trickle.sock');
// Answers, then keeps the reply arriving: only an absolute deadline ends it.
const trickle = createServer((socket) => {
	socket.once('data', () => {
		socket.write('HTTP/1.1 200 OK\r\nContent-Length: 100000\r\n\r\n');
		const drip = setInterval(() => socket.write('x'), 30);
		socket.once('close', () => clearInterval(drip));
		socket.on('error', () => {});
	});
}).listen(trickleSocketPath);
await new Promise((resolve) => trickle.once('listening', resolve));

const missingSocketPath = join(dir, 'missing.sock');
// Answers every request 404: an image that is gone.
const missing = createServer((socket) => {
	socket.on('data', () => socket.write('HTTP/1.1 404 Not Found\r\nContent-Length: 2\r\n\r\n{}'));
	socket.on('error', () => {});
}).listen(missingSocketPath);
await new Promise((resolve) => missing.once('listening', resolve));

const progressSocketPath = join(dir, 'progress.sock');
// A pull that never stops sending progress: only the absolute cap ends it (the idle clock keeps restarting).
const progress = createServer((socket) => {
	socket.once('data', () => {
		socket.write('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n');
		const line = '{"status":"Downloading"}\n';
		const drip = setInterval(() => socket.write(`${line.length.toString(16)}\r\n${line}\r\n`), 30);
		socket.once('close', () => clearInterval(drip));
		socket.on('error', () => {});
	});
}).listen(progressSocketPath);
await new Promise((resolve) => progress.once('listening', resolve));

const engine = createEngine(socketPath, timeoutMs);
const trickling = createEngine(trickleSocketPath, timeoutMs);
const checks: [string, () => Promise<unknown>][] = [
	['create', () => engine.create('python:3.13-slim', {})],
	['wait', () => engine.wait('c1')],
	['attach', () => engine.attach('c1', () => {}, timeoutMs)],
	['create (reply trickles in)', () => trickling.create('python:3.13-slim', {})],
	['create (named)', () => engine.create('python:3.13-slim', {}, 'bl-check-0123456789abcdef')],
	['remove (by name)', () => engine.remove('bl-check-0123456789abcdef')],
	[
		'pull (progress never stops)',
		() =>
			createEngine(progressSocketPath, timeoutMs, { idleMs: 60_000, maxMs: timeoutMs }).pull(
				'python:3.13-slim'
			)
	]
];

let failed = false;
for (const [name, run] of checks) {
	const started = Date.now();
	const outcome = await Promise.race([
		run().then(
			() => 'resolved',
			(error: unknown) =>
				/timed out/.test(String((error as Error)?.message))
					? 'rejected'
					: `rejected for another reason: ${error}`
		),
		new Promise<string>((resolve) => setTimeout(() => resolve('pending'), timeoutMs + slackMs))
	]);
	const took = Date.now() - started;
	const ok = outcome === 'rejected' && took >= timeoutMs - 10;
	if (!ok) failed = true;
	console.log(
		`${ok ? 'ok  ' : 'FAIL'} engine.${name}: ${outcome} after ${took} ms (limit ${timeoutMs + slackMs} ms)`
	);
}

// A create whose image is missing fails at once with ImageMissingError, and never pulls.
{
	const started = Date.now();
	const outcome = await Promise.race([
		createEngine(missingSocketPath, timeoutMs)
			.create('python:3.13-slim', {})
			.then(
				() => 'resolved',
				(error: unknown) =>
					error instanceof ImageMissingError ? 'rejected' : `rejected for another reason: ${error}`
			),
		new Promise<string>((resolve) => setTimeout(() => resolve('pending'), timeoutMs))
	]);
	const took = Date.now() - started;
	const ok = outcome === 'rejected';
	if (!ok) failed = true;
	console.log(`${ok ? 'ok  ' : 'FAIL'} engine.create (image missing): ${outcome} after ${took} ms`);
}

missing.close();
progress.close();
trickle.close();
server.close();
rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
