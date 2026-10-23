import { isHttpError, isRedirect } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from '$lib/server/identity/auth';
import { createMultiUserIdentity } from '$lib/server/identity/multi-user';
import { createFileTestDb } from '$lib/server/test-db';
import { actions, load } from './+page.server';

afterEach(() => vi.restoreAllMocks());

const CLEARED = 'better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';

function event(locals: Record<string, unknown>, headers = new Headers({ cookie: 'a=b' })) {
	const cookies = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
	return {
		cookies,
		request: { headers },
		locals,
		event: { cookies, request: { headers }, locals }
	};
}

async function run(e: ReturnType<typeof event>) {
	try {
		return await actions.signout(e.event as never);
	} catch (thrown) {
		if (isRedirect(thrown) || isHttpError(thrown)) return thrown;
		throw thrown;
	}
}

describe('the Settings page load', () => {
	const cookies = { get: () => undefined };
	const url = new URL('http://localhost/settings');

	it.each([
		['multi', true],
		['local', false]
	])(
		'tells the page whether this Instance has sessions to end: %s -> %s',
		async (mode, expected) => {
			const result = await load({
				cookies,
				url,
				locals: { instance: { mode: () => mode } }
			} as never);

			expect(result).toMatchObject({ multiUser: expected });
		}
	);
});

describe('the sign-out action', () => {
	it('ends the session with the visitor’s own cookie, clears the cookies Better Auth names, and goes to Sign in', async () => {
		const headers = new Headers();
		headers.append('set-cookie', CLEARED);
		const signOut = vi.fn(async () => ({ headers, response: { success: true } }));
		const sent = new Headers({ cookie: 'better-auth.session_token=abc' });
		const e = event({ auth: { api: { signOut } } }, sent);

		const result = await run(e);

		expect(signOut).toHaveBeenCalledWith({ headers: sent, returnHeaders: true });
		expect(e.cookies.set).toHaveBeenCalledWith(
			'better-auth.session_token',
			'',
			expect.objectContaining({ maxAge: 0, path: '/', httpOnly: true })
		);
		expect(result).toMatchObject({ status: 303, location: '/signin' });
	});

	it('has nothing to end in Local Mode: no Better Auth, a 404, nothing set', async () => {
		const e = event({});

		const result = await run(e);

		expect(result).toMatchObject({ status: 404 });
		expect(e.cookies.set).not.toHaveBeenCalled();
	});

	it('does not claim to have signed out when Better Auth fails, and logs only the kind of failure', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const signOut = async () => {
			throw Object.assign(new Error('SQLITE_BUSY at /data/app.db: DELETE FROM "Session"'), {
				code: 'SQLITE_BUSY'
			});
		};
		const getSession = async () => ({ user: { mustChangePassword: false } });
		const e = event({ auth: { api: { signOut, getSession } } });

		const result = await run(e);

		expect(result).toMatchObject({
			status: 500,
			data: { signOut: 'Signing out failed. Try again.' }
		});
		expect(JSON.stringify(result)).not.toMatch(/SQLITE|app\.db|DELETE/);
		expect(JSON.stringify(spy.mock.calls)).not.toMatch(/app\.db|DELETE/);
		expect(e.cookies.set).not.toHaveBeenCalled();
	});
});

describe('a failed sign-out for an Account that must change its password', () => {
	it.each([
		['a session that says so', async () => ({ user: { mustChangePassword: true } })],
		['no session at all', async () => null],
		[
			'a session that cannot be read',
			async () => {
				throw new Error('down');
			}
		]
	])('goes back to the password page, never renders Settings: %s', async (_what, getSession) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const signOut = async () => {
			throw new Error('down');
		};
		const e = event({ auth: { api: { signOut, getSession } } });

		const result = await run(e);

		expect(result).toMatchObject({ status: 303, location: '/account/password' });
	});
});

describe('with the real Better Auth', () => {
	async function signedIn() {
		const db = await createFileTestDb();
		const auth = createAuth({
			db,
			origin: 'http://localhost:3000',
			secret: 'test-secret-test-secret-test-secret-0123',
			admitSignUp: () => ({})
		});
		await auth.api.signUpEmail({
			body: { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' }
		});
		const { headers } = await auth.api.signInEmail({
			body: { email: 'ada@example.com', password: 'correct horse battery' },
			returnHeaders: true
		});
		const cookie = headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		return { db, auth, cookie };
	}

	it('revokes the session in the database and clears the cookie, so the old cookie is nobody', async () => {
		const { db, auth, cookie } = await signedIn();
		const who = () =>
			createMultiUserIdentity(auth).resolve({
				cookies: { get: () => undefined },
				request: { headers: new Headers({ cookie }) }
			});
		expect(await who()).not.toBeNull();
		// Sign-up made one session and sign-in another; only the one the cookie names ends.
		expect(await db.session.count()).toBe(2);
		const e = event({ auth }, new Headers({ cookie }));

		const result = await run(e);

		expect(result).toMatchObject({ status: 303, location: '/signin' });
		expect(await db.session.count()).toBe(1);
		// A copy of the cookie someone kept no longer signs anyone in.
		expect(await who()).toBeNull();
		const cleared = e.cookies.set.mock.calls.find(([name]) => name === 'better-auth.session_token');
		expect(cleared?.[1]).toBe('');
		expect(cleared?.[2]).toMatchObject({ maxAge: 0 });
	});
});
