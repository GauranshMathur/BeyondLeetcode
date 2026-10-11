import { expect, it } from 'vitest';
import { TEST_LEARNER_COOKIE } from '../e2e-learner.ts';
import { createLocalIdentity } from './identity.ts';
import { createTestDb } from './test-db.ts';

const request = (cookies: Record<string, string> = {}) => ({
	cookies: { get: (name: string) => cookies[name] }
});

it('answers every request with the Local Learner: admin, displayed as Local', async () => {
	const db = await createTestDb();
	const identity = await createLocalIdentity(db);

	const first = await identity.resolve(request());
	const second = await identity.resolve(request());

	expect(first).toEqual({ learnerId: 'local', displayName: 'Local', role: 'admin' });
	expect(second).toEqual(first);
	expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: 'local' })]);
});

it('ignores the test Learner cookie when the gate is off', async () => {
	const identity = await createLocalIdentity(await createTestDb());

	const who = await identity.resolve(request({ [TEST_LEARNER_COOKIE]: 'someone-else' }));

	expect(who?.learnerId).toBe('local');
});

it('acts as the cookie Learner when the gate is on, as a plain learner', async () => {
	const identity = await createLocalIdentity(await createTestDb(), { testLearnerCookie: true });

	const who = await identity.resolve(request({ [TEST_LEARNER_COOKIE]: 'topic-e2e' }));

	expect(who).toEqual({ learnerId: 'topic-e2e', displayName: 'Local', role: 'learner' });
});

it('with the gate on, no cookie or a malformed one is still the Local Learner', async () => {
	const identity = await createLocalIdentity(await createTestDb(), { testLearnerCookie: true });

	expect((await identity.resolve(request()))?.learnerId).toBe('local');
	expect((await identity.resolve(request({ [TEST_LEARNER_COOKIE]: 'a b/../c' })))?.learnerId).toBe(
		'local'
	);
});
