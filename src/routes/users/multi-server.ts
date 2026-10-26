import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '../../lib/server/db.ts';
import { createAuth } from '../../lib/server/identity/auth.ts';
import { createRegistration } from '../../lib/server/identity/registration.ts';
import { createFirstAdmin } from '../../lib/server/identity/setup.ts';
import { createInstance } from '../../lib/server/instance.ts';
import { freePort } from '../../lib/test/free-port.ts';
import type { ServerTarget } from './multi-fixture.ts';

// Test-only. A Multi-user server of its own, from the same build as the two Playwright servers, on a fresh
// database and a free port, for browser tests that change the Instance for everyone (the Registration
// Mode). Files run in parallel on the shared 4174 server (see playwright.config.ts) and other files rely on
// it staying as setup left it (signup.multi.e2e.ts expects it invite-only), so a test that switches it does
// it here, where nobody else is looking. The app gains nothing from this file.

const SECRET = 'e2e-only-secret-e2e-only-secret-e2e-only-0123';

export const OWN_SERVER_ADMIN = {
	name: 'Grace Admin',
	email: 'grace.admin@example.com',
	password: 'correct horse battery staple'
} as const;

export type MultiUserServer = ServerTarget & {
	/** Where the server listens, e.g. `http://localhost:41234`. */
	url: string;
	stop(): Promise<void>;
};

/**
 * Migrates a fresh database, makes it a Multi-user Instance with one admin (through the app's own
 * first-admin step, so the rows are what Setup leaves) and starts the build on it. Registration starts
 * invite-only, as on every new Instance.
 */
export async function startMultiUserServer(): Promise<MultiUserServer> {
	const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-users-'));
	const database = `file:${join(dir, 'own.db')}`;
	const port = await freePort();
	const origin = `http://localhost:${port}`;
	const env: NodeJS.ProcessEnv = {
		...process.env,
		DATABASE_URL: database,
		CONTENT_DIR: 'src/lib/server/content/fixture',
		ORIGIN: origin,
		PORT: String(port),
		BETTER_AUTH_SECRET: SECRET,
		// A multi-user Instance never takes the test switches; the Runner is never called by these pages.
		RUNNER_URL: 'http://127.0.0.1:9',
		RUNNER_TOKEN: 'e2e-unused'
	};
	delete env.IDENTITY_TEST_LEARNER;
	delete env.RUNNER_ADAPTER;

	execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], { env, stdio: 'pipe' });
	const db = createDb(database);
	try {
		const instance = await createInstance(db);
		const auth = createAuth({
			db,
			origin,
			secret: SECRET,
			admitSignUp: createRegistration({ instance })
		});
		await createFirstAdmin({ instance, auth, db }, OWN_SERVER_ADMIN);
	} finally {
		await db.$disconnect();
	}

	const server = spawn('bun', ['./build/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = '';
	server.stdout?.on('data', (chunk) => {
		output += chunk;
	});
	server.stderr?.on('data', (chunk) => {
		output += chunk;
	});
	const stop = async () => {
		await stopProcess(server);
		rmSync(dir, { recursive: true, force: true });
	};
	try {
		await ready(server, `${origin}/signup`, () => output);
	} catch (error) {
		await stop();
		throw error;
	}
	return { url: origin, origin, database, secret: SECRET, stop };
}

async function ready(server: ChildProcess, url: string, output: () => string) {
	const stopped = () => server.exitCode !== null || server.signalCode !== null;
	for (let i = 0; i < 150; i++) {
		if (stopped()) throw new Error(`the Multi-user test server exited:\n${output()}`);
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// not listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(`the Multi-user test server did not answer in time:\n${output()}`);
}

async function stopProcess(server: ChildProcess) {
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
