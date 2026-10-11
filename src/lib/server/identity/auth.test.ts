import { describe, expect, it } from 'vitest';
import { createFileTestDb } from '../test-db.ts';
import { type Admission, createAuth, MIN_PASSWORD_LENGTH } from './auth.ts';

const secret = 'test-secret-test-secret-test-secret-0123';
const body = { email: 'ada@example.com', password: 'correct horse battery', name: 'Ada' };

async function setup(admitSignUp: () => Admission | null | Promise<Admission | null> = () => ({})) {
	const db = await createFileTestDb();
	const auth = createAuth({ db, origin: 'http://localhost:3000', secret, admitSignUp });
	return { db, auth };
}

describe('createAuth', () => {
	it('signs up an Account whose session carries its learnerId and role', async () => {
		const { auth, db } = await setup();

		const res = await auth.api.signUpEmail({ body, returnHeaders: true });
		const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]);
		const session = await auth.api.getSession({
			headers: new Headers({ cookie: cookie.join('; ') })
		});

		expect(session?.user.email).toBe('ada@example.com');
		expect(session?.user.role).toBe('learner');
		expect(session?.user.mustChangePassword).toBe(false);
		expect(session?.user.learnerId).toBeTruthy();
		expect(await db.learner.count({ where: { id: session?.user.learnerId ?? '' } })).toBe(1);
	});

	it('refuses sign-up by default', async () => {
		const db = await createFileTestDb();
		const auth = createAuth({ db, origin: '', secret });

		await expect(auth.api.signUpEmail({ body })).rejects.toThrow();
		expect(await db.user.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
	});

	it('puts the admitted sign-up on the Learner and role the gate names, upserting the Learner', async () => {
		const { auth, db } = await setup(() => ({ learnerId: 'local', role: 'admin' }));
		await db.learner.create({ data: { id: 'local' } });

		await auth.api.signUpEmail({ body });

		expect(await db.user.findFirstOrThrow()).toMatchObject({ learnerId: 'local', role: 'admin' });
		expect(await db.learner.count()).toBe(1);
	});

	it('creates the named Learner when it does not exist yet', async () => {
		const { auth, db } = await setup(() => ({ learnerId: 'local' }));

		await auth.api.signUpEmail({ body });

		expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: 'local' })]);
		expect(await db.user.findFirstOrThrow()).toMatchObject({ learnerId: 'local', role: 'learner' });
	});

	it('refuses sign-up when the gate answers null, over HTTP and through auth.api', async () => {
		const { auth, db } = await setup(() => null);

		await expect(auth.api.signUpEmail({ body })).rejects.toMatchObject({ statusCode: 403 });
		const res = await auth.handler(
			new Request('http://localhost:3000/api/auth/sign-up/email', {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
				body: JSON.stringify(body)
			})
		);
		expect(res.status).toBe(403);
		expect(await db.user.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
	});

	it('refuses in the database hook on its own when the request hook admitted', async () => {
		let calls = 0;
		const { auth, db } = await setup(() => (++calls === 1 ? {} : null));

		await expect(auth.api.signUpEmail({ body })).rejects.toMatchObject({ statusCode: 403 });

		expect(calls).toBe(2);
		expect(await db.user.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
	});

	it('refuses a client that sets learnerId or role, and drops mustChangePassword', async () => {
		const { auth, db } = await setup();

		for (const [i, extra] of [{ learnerId: 'mine' }, { role: 'admin' }].entries()) {
			await expect(
				auth.api.signUpEmail({
					body: { ...body, email: `a${i}@example.com`, ...extra } as typeof body
				})
			).rejects.toMatchObject({ statusCode: 400 });
		}
		expect(await db.user.count()).toBe(0);

		// Better Auth silently ignores this one rather than refusing it.
		await auth.api.signUpEmail({
			body: { ...body, mustChangePassword: true } as typeof body
		});
		expect(await db.user.findFirstOrThrow()).toMatchObject({ mustChangePassword: false });
	});

	it('answers a closed sign-up the same for an existing email and a new one', async () => {
		const { auth, db } = await setup();
		await auth.api.signUpEmail({ body });
		const closed = createAuth({ db, origin: '', secret });

		const status = (email: string) =>
			closed.handler(
				new Request('http://localhost:3000/api/auth/sign-up/email', {
					method: 'POST',
					headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
					body: JSON.stringify({ ...body, email })
				})
			);
		const [existing, fresh] = [await status(body.email), await status('new@example.com')];

		expect(existing.status).toBe(403);
		expect(fresh.status).toBe(403);
		expect(await existing.json()).toEqual(await fresh.json());
	});

	it('refuses a password of 11 characters and takes 12', async () => {
		const { auth } = await setup();
		await expect(
			auth.api.signUpEmail({ body: { ...body, password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) } })
		).rejects.toMatchObject({ statusCode: 400 });
		await expect(
			auth.api.signUpEmail({ body: { ...body, password: 'a'.repeat(MIN_PASSWORD_LENGTH) } })
		).resolves.toBeTruthy();
	});

	it('serves no admin endpoint we do not use over HTTP', async () => {
		const { auth } = await setup();
		for (const path of [
			'set-role',
			'create-user',
			'ban-user',
			'unban-user',
			'impersonate-user',
			'stop-impersonating',
			'update-user',
			'get-user',
			'list-user-sessions',
			'revoke-user-session',
			'has-permission'
		]) {
			const res = await auth.handler(
				new Request(`http://localhost:3000/api/auth/admin/${path}`, { method: 'POST' })
			);
			expect(res.status, path).toBe(404);
		}
		for (const path of [
			'update-user',
			'verify-password',
			'update-session',
			'change-email',
			'delete-user',
			'delete-user/callback',
			'request-password-reset',
			'reset-password',
			'send-verification-email',
			'verify-email',
			'link-social',
			'unlink-account',
			'refresh-token',
			'get-access-token',
			'account-info',
			'list-accounts'
		]) {
			const res = await auth.handler(
				new Request(`http://localhost:3000/api/auth/${path}`, { method: 'POST' })
			);
			expect(res.status, path).toBe(404);
		}
		for (const [method, path] of [
			['POST', 'sign-in/email'],
			['POST', 'sign-out'],
			['GET', 'get-session'],
			['POST', 'change-password']
		] as const) {
			const res = await auth.handler(
				new Request(`http://localhost:3000/api/auth/${path}`, { method })
			);
			expect(res.status, path).not.toBe(404);
		}
		const kept = await auth.handler(
			new Request('http://localhost:3000/api/auth/admin/list-users', { method: 'GET' })
		);
		expect(kept.status).not.toBe(404);
	});

	it('needs a secret of at least 32 characters', async () => {
		const db = await createFileTestDb();
		expect(() => createAuth({ db, origin: '', secret: '' })).toThrow(/secret/i);
		expect(() => createAuth({ db, origin: '', secret: 'short' })).toThrow(/32/);
	});
});
