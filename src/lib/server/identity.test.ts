import { expect, it } from 'vitest';
import { localLearnerId } from './identity.ts';
import { createTestDb } from './test-db.ts';

it('returns the one Local Learner id, creating the Learner on first use only', async () => {
	const db = await createTestDb();

	const first = await localLearnerId(db);
	const second = await localLearnerId(db);

	expect(second).toBe(first);
	expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: first })]);
});
