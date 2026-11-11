import { isHttpError, isRedirect } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMultiUserIdentity } from '#lib/server/identity/multi-user.js';
import { createTestInstance } from '#lib/server/identity/test-auth.js';
import { actions, load } from './+page.server';

afterEach(() => vi.restoreAllMocks());

const CLEARED = 'better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';

/**
 * Locals of the server's own Multi-user wiring. `stubs` replace the Better Auth calls Sign out makes;
 * left out, the real ones run.
 */
async function multi(stubs: { signOut?: unknown; getSession?: unknown } = {}) {
	const instance = await createTestInstance();
	await instance.admin();
	const { api } = instance.auth;
	if (stubs.signOut) vi.spyOn(api, 'signOut').mockImplementation(stubs.signOut as never);
	if (stubs.getSession) vi.spyOn(api, 'getSession').mockImplementation(stubs.getSession as never);
	return { ...instance, locals: { multiUser: instance.multiUser } };
}

/** What Better Auth's get-session answers with `returnHeaders`: an Account that must, or need not, change. */
const sessionOf = (mustChangePassword: boolean | null) => async () => ({
	headers: new Headers(),
	response:
		mustChangePassword === null
			? null
			: { user: { id: 'u', name: 'Ada', learnerId: 'l', mustChangePassword } }
});

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
		const e = event((await multi({ signOut })).locals, sent);

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
		const e = event((await multi({ signOut, getSession: sessionOf(false) })).locals);

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
		['a session that says so', sessionOf(true)],
		['no session at all', sessionOf(null)],
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
		const e = event((await multi({ signOut, getSession })).locals);

		const result = await run(e);

		expect(result).toMatchObject({ status: 303, location: '/account/password' });
	});
});

describe('with the real Better Auth', () => {
	const ADA = 'ada@example.com';
	const LIN = 'lin@example.com';

	/** The Accounts Sign out must work for, each as the Account that signs in: the first admin is Ada. */
	const kinds: [string, (instance: Awaited<ReturnType<typeof multi>>) => Promise<string>][] = [
		[
			'an ordinary Learner',
			async (instance) => {
				await instance.learner({ email: LIN });
				return LIN;
			}
		],
		['an admin', async () => ADA],
		[
			'an Account that must change its password',
			async (instance) => {
				await instance.db.user.update({
					where: { email: ADA },
					data: { mustChangePassword: true }
				});
				return ADA;
			}
		]
	];

	async function signedIn(email: string, instance: Awaited<ReturnType<typeof multi>>) {
		const { headers } = await instance.auth.api.signInEmail({
			body: { email, password: 'correct horse battery' },
			returnHeaders: true
		});
		const cookie = headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		// The cookie carries the session token and its signature, joined by a dot.
		const value = decodeURIComponent(cookie.split('=').slice(1).join('='));
		return { cookie, token: value.slice(0, value.lastIndexOf('.')) };
	}

	it.each(kinds)(
		'for %s: revokes the session in the database, clears the cookie and goes to Sign in, so the old cookie is nobody',
		async (_kind, prepare) => {
			const instance = await multi();
			const { db, auth, locals } = instance;
			const email = await prepare(instance);
			const { cookie, token } = await signedIn(email, instance);
			const who = () =>
				createMultiUserIdentity(auth).resolve({
					cookies: { get: () => undefined },
					request: { headers: new Headers({ cookie }) }
				});
			expect(await who()).not.toBeNull();
			const before = await db.session.count();
			expect(await db.session.findUnique({ where: { token } })).not.toBeNull();
			const e = event(locals, new Headers({ cookie }));

			const result = await run(e);

			expect(result).toMatchObject({ status: 303, location: '/signin' });
			// Only the session the cookie names ends; the Account's others stay.
			expect(await db.session.findUnique({ where: { token } })).toBeNull();
			expect(await db.session.count()).toBe(before - 1);
			// A copy of the cookie someone kept no longer signs anyone in.
			expect(await who()).toBeNull();
			const cleared = e.cookies.set.mock.calls.find(
				([name]) => name === 'better-auth.session_token'
			);
			expect(cleared?.[1]).toBe('');
			expect(cleared?.[2]).toMatchObject({ maxAge: 0 });
		}
	);
});
