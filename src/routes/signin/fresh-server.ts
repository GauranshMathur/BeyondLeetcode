import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '../../lib/server/db.ts';

// Test-only (imported by the browser tests, never by the app): a second server from the same build, on a
// free port and a fresh database, started the way a released Instance is, with no test switch and no
// scripted Runner. By default its Instance is not set up, so a test can walk Setup for real. It has
// BETTER_AUTH_SECRET and ORIGIN, the two things Multi-user needs from the operator.
//
// A test that needs Accounts without touching the shared Multi-user server's database (two processes writing
// one SQLite file made the other files' setup time out) asks for `openRegistration`: the Instance is then
// already Multi-user with Registration Open, as a finished Setup plus the Users toggle (C34b) leave it, and
// Accounts are made through the Sign up form. The app gains no way to open registration from this.

/** `databaseUrl` is the server's own file, for a test that must change a row (the server and the test are the only users). */
export type FreshServer = { url: string; databaseUrl: string; stop(): Promise<void> };

export async function startFreshServer(
	options: { openRegistration?: boolean } = {}
): Promise<FreshServer> {
	const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-fresh-'));
	const port = await freePort();
	const url = `http://localhost:${port}`;
	const env: NodeJS.ProcessEnv = {
		...process.env,
		DATABASE_URL: `file:${join(dir, 'fresh.db')}`,
		CONTENT_DIR: 'src/lib/server/content/fixture',
		ORIGIN: url,
		PORT: String(port),
		BETTER_AUTH_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only-0123',
		// The Runner is never called by these pages.
		RUNNER_URL: 'http://127.0.0.1:9',
		RUNNER_TOKEN: 'e2e-unused'
	};
	delete env.IDENTITY_TEST_LEARNER;
	delete env.RUNNER_ADAPTER;

	execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], { env, stdio: 'pipe' });
	if (options.openRegistration) {
		// Before the server starts, so nothing else holds the file.
		const db = createDb(env.DATABASE_URL as string);
		try {
			await db.instance.create({ data: { mode: 'multi', registrationMode: 'open' } });
		} finally {
			await db.$disconnect();
		}
	}
	const server = spawn('bun', ['./build/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = '';
	server.stdout?.on('data', (chunk) => {
		output += chunk;
	});
	server.stderr?.on('data', (chunk) => {
		output += chunk;
	});
	const stopAll = async () => {
		await stop(server);
		rmSync(dir, { recursive: true, force: true });
	};
	try {
		await ready(server, `${url}/${options.openRegistration ? 'signup' : 'setup'}`, () => output);
	} catch (error) {
		await stopAll();
		throw error;
	}
	return { url, databaseUrl: env.DATABASE_URL as string, stop: stopAll };
}

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => resolve(port));
		});
	});
}

async function ready(server: ChildProcess, url: string, output: () => string) {
	const stopped = () => server.exitCode !== null || server.signalCode !== null;
	for (let i = 0; i < 150; i++) {
		if (stopped()) throw new Error(`the fresh server exited:\n${output()}`);
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// not listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(`the fresh server did not answer in time:\n${output()}`);
}

async function stop(server: ChildProcess) {
	if (server.exitCode !== null || server.signalCode !== null) return;
	const exited = new Promise((resolve) => server.once('exit', resolve));
	server.kill('SIGTERM');
	const timedOut = Symbol('timeout');
	const result = await Promise.race([
		exited,
		new Promise((resolve) => setTimeout(() => resolve(timedOut), 5_000))
	]);
	if (result === timedOut) server.kill('SIGKILL');
}
