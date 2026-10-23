import { describe, expect, it } from 'vitest';
import { createFileTestDb } from '../test-db.ts';
import { createAuth } from './auth.ts';
import { createMultiUserIdentity, repairLearners } from './multi-user.ts';

const secret = 'test-secret-test-secret-test-secret-0123';
const body = { email: 'ada@example.com', password: 'correct horse battery', name: 'Ada' };

async function setup() {
	const db = await createFileTestDb();
	const auth = createAuth({ db, origin: 'http://localhost:3000', secret, admitSignUp: () => ({}) });
	const identity = createMultiUserIdentity(auth);
	const res = await auth.api.signUpEmail({ body, returnHeaders: true });
	const cookie = res.headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');
	const asking = (cookieHeader?: string) => ({
		cookies: { get: () => undefined },
		request: { headers: new Headers(cookieHeader ? { cookie: cookieHeader } : {}) }
	});
	return { db, auth, identity, cookie, asking };
}

describe('createMultiUserIdentity', () => {
	it('resolves a valid session cookie to its Account and Learner', async () => {
		const { identity, asking, cookie, db } = await setup();
		const user = await db.user.findFirstOrThrow();

		expect(await identity.resolve(asking(cookie))).toEqual({
			learnerId: user.learnerId,
			displayName: 'Ada',
			role: 'learner',
			mustChangePassword: false,
			refreshedCookies: []
		});
	});

	it('reports an admin as admin and a pending password change', async () => {
		const { identity, asking, cookie, db } = await setup();
		await db.user.updateMany({ data: { role: 'admin', mustChangePassword: true } });

		expect(await identity.resolve(asking(cookie))).toMatchObject({
			role: 'admin',
			mustChangePassword: true
		});
	});

	it('resolves a request with no cookie to nobody', async () => {
		const { identity, asking } = await setup();
		expect(await identity.resolve(asking())).toBeNull();
	});

	it('never reads the test Learner cookie: it resolves to nobody', async () => {
		const { identity } = await setup();

		const who = await identity.resolve({
			cookies: { get: (name) => (name === 'test_learner' ? 'someone' : undefined) },
			request: { headers: new Headers({ cookie: 'test_learner=someone' }) }
		});

		expect(who).toBeNull();
	});

	it('resolves a tampered or forged cookie to nobody', async () => {
		const { identity, asking, cookie, db } = await setup();
		const [name, value] = cookie.split('=');
		const token = decodeURIComponent(value).split('.')[0];

		expect(await identity.resolve(asking(`${name}=${value.slice(0, -4)}AAAA`))).toBeNull();
		// A real token without its signature, and a token we made up.
		expect(await identity.resolve(asking(`${name}=${token}`))).toBeNull();
		expect(await identity.resolve(asking(`${name}=forged.forged`))).toBeNull();
		expect(await db.session.count()).toBe(1);
	});

	it('resolves a revoked session to nobody', async () => {
		const { identity, asking, cookie, db } = await setup();
		await db.session.deleteMany();
		expect(await identity.resolve(asking(cookie))).toBeNull();
	});

	it('resolves to nobody after the admin revokes the user sessions', async () => {
		const { identity, asking, cookie, db, auth } = await setup();
		const user = await db.user.findFirstOrThrow();
		await auth.api.revokeUserSessions({ body: { userId: user.id }, headers: await adminHeaders() });
		expect(await identity.resolve(asking(cookie))).toBeNull();

		async function adminHeaders() {
			await db.user.update({ where: { id: user.id }, data: { role: 'admin' } });
			return new Headers({ cookie });
		}
	});

	it('resolves a removed user to nobody', async () => {
		const { identity, asking, cookie, db } = await setup();
		await db.user.deleteMany();
		expect(await identity.resolve(asking(cookie))).toBeNull();
	});

	it('resolves an expired session to nobody', async () => {
		const { identity, asking, cookie, db } = await setup();
		await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
		expect(await identity.resolve(asking(cookie))).toBeNull();
	});

	it.each(['admin,learner', 'Admin', '', null, 'owner'])(
		'treats the role %j as learner',
		async (role) => {
			const { identity, asking, cookie, db } = await setup();
			await db.user.updateMany({ data: { role } });
			expect(await identity.resolve(asking(cookie))).toMatchObject({ role: 'learner' });
		}
	);

	it('resolves a banned user to nobody', async () => {
		const { identity, asking, cookie, db } = await setup();
		await db.user.updateMany({ data: { banned: true } });
		expect(await identity.resolve(asking(cookie))).toBeNull();
	});

	it('resolves a user without a learnerId to nobody', async () => {
		const { identity, asking, cookie, db } = await setup();
		await db.user.updateMany({ data: { learnerId: '' } });
		expect(await identity.resolve(asking(cookie))).toBeNull();
	});

	describe('refreshing an active session', () => {
		const DAY = 24 * 60 * 60 * 1000;

		it('hands back the extended session cookie once the session is a day old', async () => {
			const { identity, asking, cookie, db } = await setup();
			// Better Auth refreshes when expiresAt - 7 days + 1 day has passed: make it five days from expiry.
			await db.session.updateMany({ data: { expiresAt: new Date(Date.now() + 5 * DAY) } });
			const before = await db.session.findFirstOrThrow();

			const who = await identity.resolve(asking(cookie));

			expect(who?.refreshedCookies).toEqual([
				expect.stringMatching(/^better-auth\.session_token=/)
			]);
			expect((await db.session.findFirstOrThrow()).expiresAt.getTime()).toBeGreaterThan(
				before.expiresAt.getTime()
			);
		});

		it('sends nothing while the session is fresh', async () => {
			const { identity, asking, cookie } = await setup();

			const who = await identity.resolve(asking(cookie));

			expect(who?.refreshedCookies ?? []).toEqual([]);
		});

		it('sends nothing for a request that is nobody', async () => {
			const { identity, asking, cookie, db } = await setup();
			// Better Auth refreshes when expiresAt - 7 days + 1 day has passed: make it five days from expiry.
			await db.session.updateMany({ data: { expiresAt: new Date(Date.now() + 5 * DAY) } });
			await db.user.updateMany({ data: { banned: true } });

			expect(await identity.resolve(asking(cookie))).toBeNull();
		});
	});
});

describe('repairLearners', () => {
	const user = (id: string, learnerId: string) => ({
		id,
		name: id,
		email: `${id}@example.com`,
		learnerId
	});

	it('creates the Learner a User names but lacks, and removes a Learner no User references with its progress', async () => {
		const db = await createFileTestDb();
		await db.learner.create({ data: { id: 'kept' } });
		await db.user.create({ data: user('u1', 'kept') });
		await db.user.create({ data: user('u2', 'missing') });
		await db.learner.create({ data: { id: 'orphan' } });
		await db.chapterRead.create({ data: { learnerId: 'orphan', chapterId: 'c' } });
		await db.chapterRead.create({ data: { learnerId: 'kept', chapterId: 'c' } });

		expect(await repairLearners(db)).toEqual({ created: 1, removed: 1 });

		expect((await db.learner.findMany({ orderBy: { id: 'asc' } })).map((l) => l.id)).toEqual([
			'kept',
			'missing'
		]);
		expect(await db.chapterRead.findMany()).toEqual([
			expect.objectContaining({ learnerId: 'kept' })
		]);
		// The repaired Learner can now hold progress.
		await db.chapterRead.create({ data: { learnerId: 'missing', chapterId: 'c' } });
	});

	it('changes nothing when Accounts and Learners already match, and a second run changes nothing', async () => {
		const db = await createFileTestDb();
		await db.learner.create({ data: { id: 'a' } });
		await db.user.create({ data: user('u1', 'a') });

		expect(await repairLearners(db)).toEqual({ created: 0, removed: 0 });
		expect(await repairLearners(db)).toEqual({ created: 0, removed: 0 });
		expect(await db.learner.count()).toBe(1);
	});

	it('never recreates a Learner for a removed User: only Users that exist name one', async () => {
		const db = await createFileTestDb();
		await db.learner.create({ data: { id: 'a' } });
		await db.user.create({ data: user('u1', 'a') });
		await db.user.delete({ where: { id: 'u1' } });

		expect(await repairLearners(db)).toEqual({ created: 0, removed: 1 });
		expect(await db.learner.count()).toBe(0);
	});
});
