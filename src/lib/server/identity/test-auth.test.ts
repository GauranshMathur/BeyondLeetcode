import { describe, expect, it } from 'vitest';
import { createTestAuth, TEST_ORIGIN } from './test-auth.ts';

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
