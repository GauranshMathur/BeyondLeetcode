import { describe, expect, it } from 'vitest';
import { createFileTestDb } from '../test-db.ts';
import { createAuth } from './auth.ts';

const secret = 'test-secret-test-secret-test-secret-0123';
const body = { email: 'ada@example.com', password: 'correct horse battery', name: 'Ada' };

async function setup(allowSignUp: () => boolean | Promise<boolean> = () => true) {
	const db = await createFileTestDb();
	const auth = createAuth({ db, origin: 'http://localhost:3000', secret, allowSignUp });
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

	it('never stores learnerId, role or mustChangePassword from the client', async () => {
		const { auth, db } = await setup();

		const attempts = [{ learnerId: 'mine' }, { role: 'admin' }, { mustChangePassword: true }];
		for (const [i, extra] of attempts.entries()) {
			// Better Auth either rejects the field or drops it; both are safe.
			await auth.api
				.signUpEmail({ body: { ...body, email: `a${i}@example.com`, ...extra } as typeof body })
				.catch(() => undefined);
		}

		for (const user of await db.user.findMany()) {
			expect(user.learnerId).not.toBe('mine');
			expect(user.role).toBe('learner');
			expect(user.mustChangePassword).toBe(false);
		}
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
