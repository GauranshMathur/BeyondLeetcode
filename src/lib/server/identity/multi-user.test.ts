import { describe, expect, it } from 'vitest';
import { createFileTestDb } from '../test-db.ts';
import { createAuth } from './auth.ts';
import { createMultiUserIdentity } from './multi-user.ts';

const secret = 'test-secret-test-secret-test-secret-0123';
const body = { email: 'ada@example.com', password: 'correct horse battery', name: 'Ada' };

async function setup() {
	const db = await createFileTestDb();
	const auth = createAuth({ db, origin: 'http://localhost:3000', secret, allowSignUp: () => true });
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
			mustChangePassword: false
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

	it('resolves a banned user to nobody', async () => {
		const { identity, asking, cookie, db } = await setup();
		await db.user.updateMany({ data: { banned: true } });
		expect(await identity.resolve(asking(cookie))).toBeNull();
	});

	it('resolves a user without a learnerId to nobody', async () => {
		const { identity, asking, cookie, db } = await setup();
		await db.user.updateMany({ data: { learnerId: null } });
		expect(await identity.resolve(asking(cookie))).toBeNull();
	});
});
