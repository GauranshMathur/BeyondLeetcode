import { describe, expect, it } from 'vitest';
import {
	currentSession,
	emailKey,
	PASSWORD_PROVIDER_ID,
	passwordAccountWhere,
	roleOf
} from './session-binding.ts';
import { createTestAuth } from './test-auth.ts';

const headersOf = (cookie: string) => new Headers({ cookie });

describe('currentSession', () => {
	it('names the Account, its Learner and the flags', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { id, cookie } = await signUp();
		const user = await db.user.findFirstOrThrow();

		expect(await currentSession(auth, headersOf(cookie))).toEqual({
			userId: id,
			identity: { learnerId: user.learnerId, displayName: 'Ada', role: 'learner' },
			mustChangePassword: false,
			refreshedCookies: []
		});
	});

	it('is null with no cookie or a forged one', async () => {
		const { auth } = await createTestAuth();
		expect(await currentSession(auth, new Headers())).toBeNull();
		expect(
			await currentSession(auth, headersOf('better-auth.session_token=forged.sig'))
		).toBeNull();
	});

	it('reports the must-change flag and an admin', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { cookie } = await signUp();
		await db.user.updateMany({ data: { mustChangePassword: true, role: 'admin' } });

		const s = await currentSession(auth, headersOf(cookie));
		expect(s?.mustChangePassword).toBe(true);
		expect(s?.identity.role).toBe('admin');
	});

	it('is null for a stale credential generation, and drops the session', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { id, cookie } = await signUp();
		await db.account.updateMany({
			where: passwordAccountWhere(id),
			data: { credentialGeneration: 'rotated' }
		});

		expect(await currentSession(auth, headersOf(cookie))).toBeNull();
		expect(await db.session.count()).toBe(0);
	});

	it('is null for a banned user', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { cookie } = await signUp();
		await db.user.updateMany({ data: { banned: true } });
		expect(await currentSession(auth, headersOf(cookie))).toBeNull();
	});

	it('is null for an Account without a Learner', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { cookie } = await signUp();
		await db.user.updateMany({ data: { learnerId: '' } });
		expect(await currentSession(auth, headersOf(cookie))).toBeNull();
	});
});

describe('the helpers', () => {
	it('roleOf is admin exactly', () => {
		expect(roleOf('admin')).toBe('admin');
		for (const stored of ['admin,learner', 'Admin', 'learner', '', null, undefined]) {
			expect(roleOf(stored)).toBe('learner');
		}
	});

	it('emailKey lowercases and does not trim', () => {
		expect(emailKey('Ada@Example.COM')).toBe('ada@example.com');
		expect(emailKey(' a@b.c ')).toBe(' a@b.c ');
	});

	it('names the password Account', () => {
		expect(PASSWORD_PROVIDER_ID).toBe('credential');
		expect(passwordAccountWhere('u1')).toEqual({
			userId: 'u1',
			providerId: 'credential',
			accountId: 'u1'
		});
	});

	it('matches the password Account Better Auth wrote', async () => {
		const { db, signUp } = await createTestAuth();
		const { id } = await signUp();
		expect(await db.account.count({ where: passwordAccountWhere(id) })).toBe(1);
	});
});
