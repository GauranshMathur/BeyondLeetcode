import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createClient } from '@libsql/client';
import { expect, onTestFinished, test } from 'vitest';
import { createDb } from './db';

test('migrations apply to a fresh file database that createDb then uses', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-db-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	const url = `file:${join(dir, 'fresh.db')}`;

	execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
		env: { ...process.env, DATABASE_URL: url },
		stdio: 'pipe'
	});

	const db = createDb(url);
	onTestFinished(() => db.$disconnect());
	const learner = await db.learner.create({ data: {} });
	expect(await db.learner.findUnique({ where: { id: learner.id } })).toEqual(learner);
}, 30_000);

test("a write through createDb waits for another process's write lock instead of failing with P1008", async () => {
	const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-db-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	const file = join(dir, 'locked.db');
	const url = `file:${file}`;
	execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
		env: { ...process.env, DATABASE_URL: url },
		stdio: 'pipe'
	});
	// SQLite waits for a lock by blocking its thread, so the lock is held on another thread: held
	// on this one, the timer that releases it could never run.
	const holder = new Worker(
		`const { parentPort, workerData } = require('node:worker_threads');
		const { createClient } = require('@libsql/client');
		(async () => {
			const client = createClient({ url: 'file:' + workerData });
			const tx = await client.transaction('write');
			await tx.execute("INSERT INTO Learner (id, createdAt) VALUES ('other', 0)");
			parentPort.postMessage('locked');
			await new Promise((resolve) => setTimeout(resolve, 300));
			await tx.commit();
			client.close();
		})();`,
		{ eval: true, workerData: file }
	);
	onTestFinished(() => void holder.terminate());
	await new Promise((resolve, reject) => {
		holder.once('message', resolve);
		holder.once('error', reject);
	});
	const db = createDb(url);
	onTestFinished(() => db.$disconnect());

	await db.learner.create({ data: {} });

	expect(await db.learner.count()).toBe(2);
}, 30_000);

test('a Learner from before the starting-Language migration holds python after it, and a new one holds none', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-db-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	const url = `file:${join(dir, 'upgrade.db')}`;
	const env = { ...process.env, DATABASE_URL: url };

	// The migrations as an Instance had them before this one, applied by the same command the image runs.
	const older = join(dir, 'migrations');
	cpSync('prisma/migrations/migration_lock.toml', join(older, 'migration_lock.toml'), {
		recursive: true
	});
	for (const name of readdirSync('prisma/migrations')) {
		if (name === '20261124000000_starting_language' || name === 'migration_lock.toml') continue;
		cpSync(join('prisma/migrations', name), join(older, name), { recursive: true });
	}
	const config = join(dir, 'prisma.config.mjs');
	writeFileSync(
		config,
		`export default { schema: ${JSON.stringify(resolve('prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(older)} }, datasource: { url: process.env.DATABASE_URL } };`
	);
	execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy', '--config', config], {
		env,
		stdio: 'pipe'
	});

	const client = createClient({ url });
	await client.execute(`INSERT INTO "Learner" ("id","createdAt") VALUES ('before', 0)`);
	client.close();

	execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], { env, stdio: 'pipe' });

	const db = createDb(url);
	onTestFinished(() => db.$disconnect());
	expect((await db.learner.findUnique({ where: { id: 'before' } }))?.startingLanguage).toBe(
		'python'
	);
	expect((await db.learner.create({ data: {} })).startingLanguage).toBeNull();
}, 60_000);
