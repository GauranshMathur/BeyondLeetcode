import { describe, expect, it } from 'vitest';
import { createTestAuth, createTestInstance, TEST_ORIGIN } from './test-auth.ts';

describe('createTestAuth', () => {
	it('signs up with a fast hash that signs in again', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { id, email } = await signUp({ password: 'hunter2 hunter2' });

		const account = await db.account.findFirstOrThrow({ where: { userId: id } });
		expect(account.password).toMatch(/^\$test\$sha256\$/);
		await expect(
			auth.api.signInEmail({ body: { email, password: 'hunter2 hunter2' } })
		).resolves.toBeTruthy();
		await expect(
			auth.api.signInEmail({ body: { email, password: 'wrong password!!' } })
		).rejects.toThrow();
	});

	it("keeps Better Auth's own hash with hasher 'production'", async () => {
		const { db, signUp } = await createTestAuth({ hasher: 'production' });
		const { id } = await signUp();

		const account = await db.account.findFirstOrThrow({ where: { userId: id } });
		expect(account.password).not.toMatch(/^\$test\$/);
	});

	it('returns a cookie that resolves the session, and requests that carry it', async () => {
		const { auth, signUp, requestOf } = await createTestAuth();
		const { id, cookie } = await signUp({ email: 'grace@example.com' });

		const request = requestOf(cookie, '/x?y=1', { method: 'POST' });
		expect(request.url).toBe(`${TEST_ORIGIN}/x?y=1`);
		expect(request.method).toBe('POST');
		const session = await auth.api.getSession({ headers: request.headers });
		expect(session?.user.id).toBe(id);
	});

	it('admits everyone by default and honours admit', async () => {
		const closed = await createTestAuth({ admit: () => null });
		await expect(closed.signUp()).rejects.toThrow();
	});
});

describe('createTestInstance', () => {
	it('is the production wiring: an Instance not set up refuses a sign-up until an override says otherwise', async () => {
		const { auth } = await createTestInstance();
		await expect(
			auth.api.signUpEmail({
				body: { name: 'A', email: 'a@example.com', password: 'a long password' }
			})
		).rejects.toThrow();

		const open = await createTestInstance({ admit: () => () => ({}) });
		await expect(
			open.auth.api.signUpEmail({
				body: { name: 'A', email: 'a@example.com', password: 'a long password' }
			})
		).resolves.toBeTruthy();
	});

	it('makes an admin, a learner and a GitHub-only Account, each with a session that resolves', async () => {
		const t = await createTestInstance();
		const admin = await t.admin();
		const lin = await t.learner();
		const oz = await t.githubOnly();

		const who = (cookie: string) =>
			t.resolver.resolve({
				cookies: { get: () => undefined },
				request: { headers: new Headers({ cookie }) }
			});
		expect(await who(admin.cookie)).toMatchObject({ role: 'admin', learnerId: 'local' });
		expect(await who(lin.cookie)).toMatchObject({ role: 'learner', displayName: 'Lin' });
		expect(await who(oz.cookie)).toMatchObject({ role: 'learner', displayName: 'Oz' });
		expect(await t.db.account.count({ where: { userId: oz.id, providerId: 'credential' } })).toBe(
			0
		);
	});

	it('keeps the Registration Mode: a learner is made on an invite-only Instance, a visitor is still refused', async () => {
		const t = await createTestInstance();
		await t.admin();
		await t.learner();

		expect(t.instance.registrationMode()).toBe('invite');
		await expect(
			t.auth.api.signUpEmail({
				body: { name: 'B', email: 'b@example.com', password: 'a long password' }
			})
		).rejects.toThrow();
	});

	it('chooses Local: the mode and its one Learner', async () => {
		const t = await createTestInstance();
		await t.chooseLocal();

		expect(t.instance.mode()).toBe('local');
		expect(await t.db.learner.count({ where: { id: 'local' } })).toBe(1);
	});
});
