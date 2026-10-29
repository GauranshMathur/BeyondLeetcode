import { Worker } from 'node:worker_threads';
import { expect, onTestFinished, test } from 'vitest';
import { createFileTestDb, createTestDb } from './test-db';

test('a Learner written to the in-memory database reads back', async () => {
	const db = await createTestDb();

	const learner = await db.learner.create({ data: {} });

	expect(await db.learner.findUnique({ where: { id: learner.id } })).toEqual(learner);
});

test('an interactive transaction writes to the same migrated database', async () => {
	const db = await createTestDb();

	const learner = await db.$transaction((tx) => tx.learner.create({ data: {} }));

	expect(await db.learner.findMany()).toEqual([learner]);
});

test('each call gives a fresh, empty database', async () => {
	const first = await createTestDb();
	await first.learner.create({ data: {} });

	const second = await createTestDb();

	expect(await second.learner.count()).toBe(0);
});

test('each file database starts empty even after another one was written to', async () => {
	const first = await createFileTestDb();
	await first.learner.create({ data: {} });

	const second = await createFileTestDb();

	expect(await second.learner.count()).toBe(0);
	expect(await first.learner.count()).toBe(1);
});

test("a write waits for another connection's write lock instead of failing at once", async () => {
	const db = await createFileTestDb();
	const [{ file }] = await db.$queryRaw<
		{ file: string }[]
	>`SELECT file FROM pragma_database_list WHERE name = 'main'`;
	// SQLite waits for a lock by blocking its thread, so the lock is held on another thread: held on
	// this one, the timer that releases it could never run.
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

	await db.learner.create({ data: {} });

	expect(await db.learner.count()).toBe(2);
});

test('a file database skips fsync on every connection, inside a transaction and outside', async () => {
	const db = await createFileTestDb();
	const [outside] = await db.$queryRaw<{ synchronous: number }[]>`PRAGMA synchronous`;
	const inside = await db.$transaction(async (tx) => {
		const [row] = await tx.$queryRaw<{ synchronous: number }[]>`PRAGMA synchronous`;
		return row;
	});

	expect(Number(outside.synchronous)).toBe(0);
	expect(Number(inside.synchronous)).toBe(0);
});
