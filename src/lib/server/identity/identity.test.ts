import { describe, expect, it, vi } from 'vitest';
import { TEST_LEARNER_COOKIE } from '../../e2e-learner.ts';
import { createTestDb } from '../test-db.ts';
import { createIdentity, createLocalIdentity, type IdentityResolver } from './index.ts';

const request = (cookies: Record<string, string> = {}) => ({
	cookies: { get: (name: string) => cookies[name] },
	request: { headers: new Headers() }
});

it('answers every request with the Local Learner: admin, displayed as Local', async () => {
	const db = await createTestDb();
	const identity = await createLocalIdentity(db);
	await identity.ensureLocalLearner();

	const first = await identity.resolve(request());
	const second = await identity.resolve(request());

	expect(first).toEqual({ learnerId: 'local', displayName: 'Local', role: 'admin' });
	expect(second).toEqual(first);
	expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: 'local' })]);
});

it('creates no Learner until ensureLocalLearner runs, and running it twice makes one', async () => {
	const db = await createTestDb();
	const identity = await createLocalIdentity(db);
	expect(await db.learner.count()).toBe(0);

	await identity.ensureLocalLearner();
	await identity.ensureLocalLearner();

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

it('with the gate on, the cookie Learner gets its row, once, so its progress can be written', async () => {
	const db = await createTestDb();
	const identity = await createLocalIdentity(db, { testLearnerCookie: true });

	await identity.resolve(request({ [TEST_LEARNER_COOKIE]: 'topic-e2e' }));
	await identity.resolve(request({ [TEST_LEARNER_COOKIE]: 'topic-e2e' }));

	expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: 'topic-e2e' })]);
});

describe('createIdentity', () => {
	const ada = { learnerId: 'l1', displayName: 'Ada', role: 'learner' as const };
	const adapter = (found: Awaited<ReturnType<IdentityResolver['resolve']>>) => ({
		resolve: vi.fn(async () => found)
	});
	const asking = (
		mode: 'local' | 'multi' | null,
		local: IdentityResolver,
		multi: IdentityResolver | null
	) => createIdentity({ instance: { mode: () => mode }, local, multi });

	it('asks nobody before Setup', async () => {
		const local = adapter(ada);
		const multi = adapter(ada);

		expect(await asking(null, local, multi).resolve(request())).toEqual({
			kind: 'resolved',
			who: null,
			mustChangePassword: false,
			refreshedCookies: []
		});
		expect(local.resolve).not.toHaveBeenCalled();
		expect(multi.resolve).not.toHaveBeenCalled();
	});

	it('asks only the Local adapter in Local Mode', async () => {
		const local = adapter(ada);
		const multi = adapter(null);

		expect(await asking('local', local, multi).resolve(request())).toEqual({
			kind: 'resolved',
			who: ada,
			mustChangePassword: false,
			refreshedCookies: []
		});
		expect(multi.resolve).not.toHaveBeenCalled();
	});

	it('asks only the Multi-user adapter in Multi-user Mode, and carries its extras apart from who', async () => {
		const local = adapter(null);
		const multi = adapter({ ...ada, mustChangePassword: true, refreshedCookies: ['a=b'] });

		expect(await asking('multi', local, multi).resolve(request())).toEqual({
			kind: 'resolved',
			who: ada,
			mustChangePassword: true,
			refreshedCookies: ['a=b']
		});
		expect(local.resolve).not.toHaveBeenCalled();
	});

	it('is nobody in Multi-user Mode when the adapter finds no one', async () => {
		expect(await asking('multi', adapter(ada), adapter(null)).resolve(request())).toEqual({
			kind: 'resolved',
			who: null,
			mustChangePassword: false,
			refreshedCookies: []
		});
	});

	it('is unavailable for a Multi-user Instance with no adapter', async () => {
		expect(await asking('multi', adapter(ada), null).resolve(request())).toEqual({
			kind: 'unavailable'
		});
	});
});
