import { createHmac } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { createAuth } from '$lib/server/identity/auth';
import { createThrottle } from '$lib/server/identity/throttle';
import { createFileTestDb } from '$lib/server/test-db';
import { createChangePassword } from './change-password';

// Hashing a password is slow on purpose, and some tests change several.
vi.setConfig({ testTimeout: 60_000 });

// The Change password action through the real Better Auth: what it changes, what it ends, what it refuses.

const secret = 'test-secret-test-secret-test-secret-0123';
const oldPassword = 'correct horse battery staple';
const newPassword = 'a brand new passphrase 42';
const cookieOf = (headers: Headers) =>
	headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');

type Auth = ReturnType<typeof createAuth>;

async function setup() {
	const db = await createFileTestDb();
	const auth = createAuth({
		db,
		origin: 'http://localhost:3000',
		secret,
		admitSignUp: () => ({})
	});
	let n = 0;
	/** An Account with a session from its sign-up. `forced` sets the flag, as an admin's reset does. */
	async function account(forced: boolean) {
		n += 1;
		const email = `user${n}@example.com`;
		const signedUp = await auth.api.signUpEmail({
			body: { name: `User ${n}`, email, password: oldPassword },
			returnHeaders: true
		});
		const { internalAdapter } = await auth.$context;
		const id = signedUp.response.user.id;
		if (forced) await internalAdapter.updateUser(id, { mustChangePassword: true });
		return { id, email, cookie: cookieOf(signedUp.headers) };
	}
	async function signIn(email: string, password: string) {
		try {
			const { headers } = await auth.api.signInEmail({
				body: { email, password },
				returnHeaders: true
			});
			return cookieOf(headers);
		} catch {
			return null;
		}
	}
	const sessionOf = async (cookie: string) =>
		(await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user ?? null;
	/** An Account that signs in only with GitHub: no password Account, and a session as a callback makes it. */
	async function providerOnly() {
		await db.learner.create({ data: { id: 'oz-learner' } });
		await db.user.create({
			data: { id: 'oz', name: 'Oz', email: 'oz@example.com', learnerId: 'oz-learner' }
		});
		await db.account.create({
			data: { id: 'oz-gh', accountId: '99', providerId: 'github', userId: 'oz' }
		});
		const token = 'oz-github-session-token';
		await db.session.create({
			data: {
				id: 'oz-s',
				token,
				userId: 'oz',
				expiresAt: new Date(Date.now() + 1e9),
				credentialGeneration: ''
			}
		});
		const signature = createHmac('sha256', secret).update(token).digest('base64');
		return {
			id: 'oz',
			cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`
		};
	}
	return { auth, db, account, providerOnly, signIn, sessionOf };
}

const throttleFor = () => createThrottle();

function event(
	auth: Auth | undefined,
	cookie: string,
	fields: Record<string, string>,
	address = '10.0.0.1',
	search = ''
) {
	const set = vi.fn();
	const ev = {
		request: new Request('http://localhost/account/password', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				...(cookie ? { cookie } : {})
			},
			body: new URLSearchParams(fields)
		}),
		locals: { auth },
		cookies: { set },
		url: new URL(`http://localhost/account/password${search}`),
		getClientAddress: () => address
	} as unknown as RequestEvent;
	return { ev, set };
}

const form = (current: string, next: string, confirm = next) => ({ current, new: next, confirm });

/** Runs the action; a redirect or `error` the action throws comes back as `thrown`. */
async function run(
	action: ReturnType<typeof createChangePassword>['action'],
	ev: RequestEvent
): Promise<{ result?: unknown; thrown?: { status: number; location?: string } }> {
	try {
		return { result: await action(ev) };
	} catch (thrown) {
		return { thrown: thrown as { status: number; location?: string } };
	}
}

describe('an Account with no password', () => {
	it('is told so, and no throttle attempt is counted', async () => {
		const { auth, providerOnly } = await setup();
		const throttle = createThrottle();
		const attempt = vi.spyOn(throttle, 'attempt');
		const { action } = createChangePassword(throttle);
		const me = await providerOnly();

		const { result } = await run(
			action,
			event(auth, me.cookie, form('anything at all', newPassword)).ev
		);

		expect(result).toMatchObject({
			status: 400,
			data: { field: null, message: expect.stringMatching(/has no password/) }
		});
		expect(attempt).not.toHaveBeenCalled();
	});

	it('keeps its budget: 25 tries leave the throttle unspent for a later password', async () => {
		const { auth, providerOnly } = await setup();
		const throttle = createThrottle();
		const { action } = createChangePassword(throttle);
		const me = await providerOnly();

		for (let i = 0; i < 25; i++) {
			await run(action, event(auth, me.cookie, form('anything at all', newPassword)).ev);
		}

		expect(throttle.attempt({ address: '10.0.0.1', accountId: me.id }).allowed).toBe(true);
	});
});

describe('changing a password', () => {
	it('sets the new password, ends every other session, clears the flag and goes on', async () => {
		const { auth, account, signIn, sessionOf } = await setup();
		const { action } = createChangePassword(throttleFor());
		const me = await account(true);
		const other = (await signIn(me.email, oldPassword)) as string;
		// This session predates the change, as a sign-in that raced an admin's reset would.
		expect(await sessionOf(other)).toMatchObject({ mustChangePassword: true });

		const { ev, set } = event(auth, me.cookie, form(oldPassword, newPassword));
		const { thrown } = await run(action, ev);

		expect(thrown).toMatchObject({ status: 303, location: '/' });
		expect(await signIn(me.email, newPassword)).not.toBeNull();
		expect(await signIn(me.email, oldPassword)).toBeNull();
		expect(await sessionOf(other)).toBeNull();
		expect(await sessionOf(me.cookie)).toBeNull();
		// The new session's cookie went out, and it works with the flag clear.
		const names = set.mock.calls.map((call) => call[0]);
		expect(names.some((name: string) => name.includes('session_token'))).toBe(true);
		const fresh = set.mock.calls
			.filter((call) => String(call[0]).includes('session_token'))
			.map((call) => `${call[0]}=${call[1]}`)
			.join('; ');
		expect(await sessionOf(fresh)).toMatchObject({ mustChangePassword: false });
	});

	it('for a user who need not change it: changes it, ends other sessions and shows the page again', async () => {
		const { auth, account, signIn, sessionOf } = await setup();
		const { action } = createChangePassword(throttleFor());
		const me = await account(false);
		const other = (await signIn(me.email, oldPassword)) as string;

		const { thrown } = await run(action, event(auth, me.cookie, form(oldPassword, newPassword)).ev);

		// A redirect to a request that carries the new cookie: the old one is gone.
		expect(thrown).toMatchObject({ status: 303, location: '/account/password?changed' });
		expect(await signIn(me.email, newPassword)).not.toBeNull();
		expect(await sessionOf(other)).toBeNull();
	});

	it('treats two spellings of one password as the same, so the one-time password cannot be kept', async () => {
		const { auth, account, signIn } = await setup();
		const { action } = createChangePassword(throttleFor());
		const me = await account(true);
		// Fullwidth "c": Better Auth hashes the NFKC form, so this signs in as the old password does.
		const spelled = `\uFF43${oldPassword.slice(1)}`;

		const { result } = await run(action, event(auth, me.cookie, form(oldPassword, spelled)).ev);

		expect(result).toMatchObject({ status: 400, data: { field: 'new' } });
		expect(
			(await (await auth.$context).internalAdapter.findUserById(me.id)) as {
				mustChangePassword?: boolean;
			}
		).toMatchObject({ mustChangePassword: true });
		expect(await signIn(me.email, oldPassword)).not.toBeNull();
	});

	it.each([
		['deleting the sessions', 'deleteUserSessions'],
		['creating the new session', 'createSession']
	] as const)(
		'if %s fails inside the change: no earlier session survives and the user is told plainly',
		async (_what, method) => {
			const { auth, account, signIn, sessionOf } = await setup();
			const { action } = createChangePassword(throttleFor());
			const me = await account(true);
			const other = (await signIn(me.email, oldPassword)) as string;
			const context = await auth.$context;
			const spy = vi
				.spyOn(context.internalAdapter, method)
				.mockRejectedValueOnce(new Error('down: /secret/path'));
			const log = vi.spyOn(console, 'error').mockImplementation(() => {});

			const { result } = await run(
				action,
				event(auth, me.cookie, form(oldPassword, newPassword)).ev
			);

			expect(result).toMatchObject({ status: 500, data: { field: null } });
			expect((result as { data: { message: string } }).data.message).toContain('may have changed');
			expect(JSON.stringify(result)).not.toContain('secret');
			expect(await sessionOf(me.cookie)).toBeNull();
			expect(await sessionOf(other)).toBeNull();
			// The change itself did go through.
			expect(await signIn(me.email, newPassword)).not.toBeNull();
			spy.mockRestore();
			log.mockRestore();
		}
	);

	it('if ending the sessions fails twice: says so plainly, and the earlier sessions are not accepted', async () => {
		const { auth, account, signIn, sessionOf } = await setup();
		const { action } = createChangePassword(throttleFor());
		const me = await account(true);
		const other = (await signIn(me.email, oldPassword)) as string;
		const context = await auth.$context;
		const spy = vi
			.spyOn(context.internalAdapter, 'deleteUserSessions')
			.mockRejectedValue(new Error('down: /secret/path'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { result } = await run(action, event(auth, me.cookie, form(oldPassword, newPassword)).ev);

		expect(result).toMatchObject({ status: 500, data: { field: null } });
		const message = (result as { data: { message: string } }).data.message;
		expect(message).toContain('Other sessions may still be signed in');
		expect(message).not.toContain('signed out of every session');
		expect(JSON.stringify(result)).not.toContain('secret');
		// The password changed and the earlier session rows survived, but a session that began before the password
		// was set is not accepted (C53), so the message's "may still be signed in" is the safe side.
		expect(await sessionOf(other)).toBeNull();
		spy.mockRestore();
		log.mockRestore();
		expect(await signIn(me.email, newPassword)).not.toBeNull();
	});

	it('refuses a wrong current password with a fixed text, changing nothing', async () => {
		const { auth, account, signIn, sessionOf } = await setup();
		const { action } = createChangePassword(throttleFor());
		const me = await account(true);

		const { result } = await run(
			action,
			event(auth, me.cookie, form('not the password', newPassword)).ev
		);

		expect(result).toMatchObject({
			status: 400,
			data: { field: 'current', message: 'That is not your current password.' }
		});
		expect(JSON.stringify(result)).not.toContain(newPassword);
		expect(JSON.stringify(result)).not.toContain('not the password');
		expect(await signIn(me.email, oldPassword)).not.toBeNull();
		expect(await sessionOf(me.cookie)).toMatchObject({ mustChangePassword: true });
	});

	it('limits guesses of the current password per Account, and a right one does not get past the limit', async () => {
		const { auth, account, signIn } = await setup();
		const { action } = createChangePassword(throttleFor());
		const me = await account(false);

		for (let i = 0; i < 5; i++) {
			await run(action, event(auth, me.cookie, form(`guess number ${i} x`, newPassword)).ev);
		}
		const { result } = await run(action, event(auth, me.cookie, form(oldPassword, newPassword)).ev);

		// The same text as a wrong one, and the password did not change.
		expect(result).toMatchObject({
			status: 400,
			data: { message: 'That is not your current password.' }
		});
		expect(await signIn(me.email, oldPassword)).not.toBeNull();
	});

	it('limits guesses per address across Accounts', async () => {
		const { auth, account } = await setup();
		const { action } = createChangePassword(throttleFor());
		const accounts = [
			await account(false),
			await account(false),
			await account(false),
			await account(false),
			await account(false)
		];
		for (let i = 0; i < 20; i++) {
			const who = accounts[i % accounts.length];
			await run(action, event(auth, who.cookie, form(`guess number ${i} x`, newPassword)).ev);
		}
		const fresh = await account(false);
		const { result } = await run(
			action,
			event(auth, fresh.cookie, form(oldPassword, newPassword)).ev
		);
		expect(result).toMatchObject({ status: 400, data: { field: 'current' } });
		// Another address is not held by it.
		const other = await run(
			action,
			event(auth, fresh.cookie, form(oldPassword, newPassword), '10.0.0.2').ev
		);
		expect(other.thrown).toMatchObject({ status: 303, location: '/account/password?changed' });
	});

	it('a right password gives its count back, so changing many times is not limited', async () => {
		const { auth, account } = await setup();
		const { action } = createChangePassword(throttleFor());
		const me = await account(false);
		let current = oldPassword;
		let cookie = me.cookie;
		for (let i = 0; i < 8; i++) {
			const next = `passphrase number ${i} ok`;
			const { ev, set } = event(auth, cookie, form(current, next));
			expect((await run(action, ev)).thrown).toMatchObject({ status: 303 });
			cookie = set.mock.calls
				.filter((call) => String(call[0]).includes('session_token'))
				.map((call) => `${call[0]}=${call[1]}`)
				.join('; ');
			current = next;
		}
	});

	it.each([
		['too short', form(oldPassword, 'short'), 'new', 'Use at least 12 characters.'],
		['too long', form(oldPassword, 'x'.repeat(129)), 'new', 'Use at most 128 characters.'],
		[
			'not confirmed',
			form(oldPassword, newPassword, `${newPassword}!`),
			'confirm',
			'The two new passwords do not match.'
		],
		[
			'the same as the current one',
			form(oldPassword, oldPassword),
			'new',
			'Choose a password different from your current one.'
		]
	])(
		'refuses a new password that is %s, with a fixed text',
		async (_name, fields, field, message) => {
			const { auth, account, signIn } = await setup();
			const { action } = createChangePassword(throttleFor());
			const me = await account(true);

			const { result } = await run(action, event(auth, me.cookie, fields).ev);

			expect(result).toMatchObject({ status: 400, data: { field, message } });
			expect(JSON.stringify(result)).not.toContain(fields.new);
			expect(await signIn(me.email, oldPassword)).not.toBeNull();
		}
	);

	it('does not spend the budget on a new password it refuses before looking at the current one', async () => {
		const { auth, account } = await setup();
		const { action } = createChangePassword(throttleFor());
		const me = await account(false);
		for (let i = 0; i < 10; i++)
			await run(action, event(auth, me.cookie, form(oldPassword, 'short')).ev);
		const { thrown } = await run(action, event(auth, me.cookie, form(oldPassword, newPassword)).ev);
		expect(thrown).toMatchObject({ status: 303, location: '/account/password?changed' });
	});

	it('if clearing the flag fails: the password has changed, other sessions are gone, the new cookie went out, and a retry finishes', async () => {
		const { auth, account, signIn, sessionOf } = await setup();
		const { action } = createChangePassword(throttleFor());
		const me = await account(true);
		const other = (await signIn(me.email, oldPassword)) as string;
		const context = await auth.$context;
		const real = context.internalAdapter.updateUser;
		const spy = vi
			.spyOn(context.internalAdapter, 'updateUser')
			.mockRejectedValueOnce(new Error('database is down: /secret/path'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { ev, set } = event(auth, me.cookie, form(oldPassword, newPassword));
		const { thrown } = await run(action, ev);

		// The page is asked for afresh (a no-JavaScript post would load with the cookie that just ended).
		expect(thrown).toMatchObject({ status: 303, location: '/account/password?unfinished' });
		expect(await signIn(me.email, newPassword)).not.toBeNull();
		expect(await sessionOf(other)).toBeNull();
		const fresh = set.mock.calls
			.filter((call) => String(call[0]).includes('session_token'))
			.map((call) => `${call[0]}=${call[1]}`)
			.join('; ');
		// Signed in with the flag still up: the form is the way out.
		expect(await sessionOf(fresh)).toMatchObject({ mustChangePassword: true });
		spy.mockRestore();
		log.mockRestore();
		expect(context.internalAdapter.updateUser).toBe(real);

		const again = await run(
			action,
			event(auth, fresh, form(newPassword, 'yet another passphrase 7')).ev
		);
		expect(again.thrown).toMatchObject({ status: 303, location: '/' });
		const row = await (await auth.$context).internalAdapter.findUserById(me.id);
		expect((row as { mustChangePassword?: boolean }).mustChangePassword).toBe(false);
	});

	it('answers a failure of the library with a fixed text and logs only its kind', async () => {
		const { auth, account } = await setup();
		const { action } = createChangePassword(throttleFor());
		const me = await account(false);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = {
			...auth,
			api: {
				getSession: auth.api.getSession,
				changePassword: async () => {
					throw new Error(`boom ${newPassword}`);
				}
			}
		} as unknown as Auth;

		const { result } = await run(
			action,
			event(broken, me.cookie, form(oldPassword, newPassword)).ev
		);

		expect(result).toMatchObject({ status: 500, data: { field: null } });
		expect(JSON.stringify(log.mock.calls)).not.toContain(newPassword);
		log.mockRestore();
	});

	it('is 404 without Better Auth (Local Mode) and sends nobody to Sign in', async () => {
		const { auth } = await setup();
		const { action, load } = createChangePassword(throttleFor());
		expect(
			(await run(action, event(undefined, '', form(oldPassword, newPassword)).ev)).thrown
		).toMatchObject({ status: 404 });
		const signedOut = await run(action, event(auth, '', form(oldPassword, newPassword)).ev);
		expect(signedOut.thrown).toMatchObject({ status: 303, location: '/signin' });
		await expect(
			load({
				...event(auth, '', {}).ev,
				request: new Request('http://localhost/account/password')
			} as never)
		).rejects.toMatchObject({ status: 303 });
	});

	it('load of a post that ended every session shows the page signed out instead of redirecting', async () => {
		const { auth, account } = await setup();
		const { load } = createChangePassword(throttleFor());
		const me = await account(false);
		await (await auth.$context).internalAdapter.deleteUserSessions(me.id);
		expect(await load(event(auth, me.cookie, {}).ev)).toMatchObject({ signedOut: true });
	});

	it('load says whether the user must change their password', async () => {
		const { auth, account } = await setup();
		const { load } = createChangePassword(throttleFor());
		const forced = await account(true);
		const free = await account(false);
		expect(await load(event(auth, forced.cookie, {}).ev)).toEqual({
			forced: true,
			changed: false,
			unfinished: false,
			signedOut: false,
			minPasswordLength: 12
		});
		expect(await load(event(auth, free.cookie, {}).ev)).toEqual({
			forced: false,
			changed: false,
			unfinished: false,
			signedOut: false,
			minPasswordLength: 12
		});
		expect(await load(event(auth, free.cookie, {}, '10.0.0.1', '?changed').ev)).toMatchObject({
			changed: true
		});
		expect(await load(event(auth, free.cookie, {}, '10.0.0.1', '?unfinished').ev)).toMatchObject({
			unfinished: true
		});
	});
});
