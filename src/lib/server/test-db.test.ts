import { expect, test } from 'vitest';
import { createTestDb } from './test-db';

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
