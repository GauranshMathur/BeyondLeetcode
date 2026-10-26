import { inspect } from 'node:util';
import { isRedirect } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuth, INVITE_COOKIE } from '#lib/server/identity/auth.js';
import { createInvites, INVITE_LIFETIME_MS } from '#lib/server/identity/invites.js';
import { createRegistration } from '#lib/server/identity/registration.js';
import { createThrottle } from '#lib/server/identity/throttle.js';
import { createFileTestDb } from '#lib/server/test-db.js';
import { createAccept } from './accept';

afterEach(() => vi.restoreAllMocks());

const secret = 'test-secret-test-secret-test-secret-0123';
const origin = 'http://localhost:3000';
const admin = { learnerId: 'local', displayName: 'Ada', role: 'admin' as const };
const lin = { name: 'Lin Chen', email: 'lin@example.com', password: 'correct horse battery' };

type Form = Record<string, string>;
const formOf = (values: Form) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(values)) body.set(key, value);
	return body;
};

async function real(options: { throttle?: ReturnType<typeof createThrottle> } = {}) {
	const db = await createFileTestDb();
	await db.learner.create({ data: { id: 'local' } });
	await db.user.create({
		data: {
			id: 'u-admin',
			name: 'Ada',
			email: 'admin@example.com',
			role: 'admin',
			learnerId: 'local'
		}
	});
	const invites = createInvites({ db, origin });
	const instance = { mode: () => 'multi' as const, registrationMode: () => 'invite' as const };
	const auth = createAuth({
		db,
		origin,
		secret,
		admitSignUp: createRegistration({ instance, invites }),
		claimInvite: (token, now) => invites.claim(token, now)
	});
	const accept = createAccept(options.throttle ?? createThrottle());
	const jar = new Map<string, string>();
	const cookies = {
		set: vi.fn((name: string, value: string) => void jar.set(name, value)),
		delete: vi.fn((name: string) => void jar.delete(name))
	};
	const locals = { instance, auth, invites, identity: undefined as unknown };
	const event = (token: string, values: Form = {}) => ({
		request: { formData: async () => formOf(values) },
		locals,
		cookies,
		params: { token },
		url: new URL(`${origin}/invite/${token}`),
		setHeaders: vi.fn(),
		getClientAddress: () => '203.0.113.7'
	});
	const post = async (token: string, values: Form) => {
		try {
			return await accept.action(event(token, values) as never);
		} catch (thrown) {
			if (isRedirect(thrown)) return thrown;
			throw thrown;
		}
	};
	const create = () => invites.create({ who: admin, now: new Date() });
	return { db, invites, accept, cookies, jar, locals, event, post, create };
}

describe('the page', () => {
	it('puts a valid token in an httpOnly SameSite=Lax cookie and offers the form', async () => {
		const { accept, event, create, cookies } = await real();
		const { token } = await create();

		expect(await accept.load(event(token) as never)).toEqual({
			valid: true,
			minPasswordLength: 12
		});
		expect(cookies.set).toHaveBeenCalledWith(
			INVITE_COOKIE,
			token,
			expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: false, path: '/api/auth' })
		);
	});

	it('sets a Secure cookie on an https origin', async () => {
		const { accept, event, create, cookies } = await real();
		const { token } = await create();

		await accept.load({
			...event(token),
			url: new URL(`https://learn.example.com/invite/${token}`)
		} as never);

		expect(cookies.set).toHaveBeenCalledWith(
			INVITE_COOKIE,
			token,
			expect.objectContaining({ secure: true })
		);
	});

	it.each([
		['plain http on a LAN address', 'http://192.168.1.20:3000', false],
		['https', 'https://learn.example.com', true]
	])('clears the invite cookie with secure stated, over %s', async (_name, address, secure) => {
		const { accept, event, cookies } = await real();
		const token = 'A'.repeat(43); // no such Invite, so the page clears what an earlier one left

		await accept.load({ ...event(token), url: new URL(`${address}/invite/${token}`) } as never);

		expect(cookies.delete).toHaveBeenCalledWith(INVITE_COOKIE, { path: '/api/auth', secure });
		expect(cookies.delete).toHaveBeenCalledWith(INVITE_COOKIE, { path: '/invite', secure });
	});

	it('clears the invite cookie with secure stated after an accepted sign-up on plain http', async () => {
		const { post, create, cookies } = await real();
		const { token } = await create();

		await post(token, lin);

		expect(cookies.delete).toHaveBeenCalledWith(INVITE_COOKIE, {
			path: '/api/auth',
			secure: false
		});
		expect(cookies.delete).toHaveBeenCalledWith(INVITE_COOKIE, { path: '/invite', secure: false });
	});

	it('sets no cookie for an unknown, used, expired or cancelled token', async () => {
		const { accept, event, create, cookies, invites, db } = await real();
		const used = await create();
		await invites.claim(used.token, new Date());
		const cancelled = await create();
		await invites.cancel({ who: admin, id: cancelled.id });
		const expired = await create();
		await db.invite.update({
			where: { id: expired.id },
			data: { expiresAt: new Date(Date.now() - INVITE_LIFETIME_MS) }
		});

		for (const token of ['A'.repeat(43), 'short', used.token, cancelled.token, expired.token]) {
			expect(await accept.load(event(token) as never)).toEqual({
				valid: false,
				minPasswordLength: 12
			});
		}
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('sends someone who is already signed in to the Map', async () => {
		const { accept, event, create, locals } = await real();
		const { token } = await create();
		locals.identity = { learnerId: 'l1' };

		await expect(accept.load(event(token) as never)).rejects.toMatchObject({
			status: 303,
			location: '/'
		});
	});
});

describe('accepting', () => {
	it('creates one learner Account, signs it in, spends the Invite and clears the cookie', async () => {
		const { post, create, db, cookies, invites } = await real();
		const { token } = await create();

		const result = await post(token, lin);

		expect(result).toMatchObject({ status: 303, location: '/' });
		const user = await db.user.findUniqueOrThrow({ where: { email: lin.email } });
		expect(user).toMatchObject({ name: lin.name, role: 'learner' });
		expect(user.learnerId).not.toBe('local');
		expect(await db.learner.findUnique({ where: { id: user.learnerId as string } })).not.toBeNull();
		expect(cookies.set).toHaveBeenCalledWith(
			expect.stringContaining('session_token'),
			expect.any(String),
			expect.objectContaining({ httpOnly: true })
		);
		expect(cookies.delete).toHaveBeenCalledWith(INVITE_COOKIE, {
			path: '/api/auth',
			secure: false
		});
		expect(cookies.delete).toHaveBeenCalledWith(INVITE_COOKIE, { path: '/invite', secure: false });
		expect(await invites.lookup(token, new Date())).toBeNull();
	});

	it('refuses a second use of the same link and creates no second Account', async () => {
		const { post, create, db } = await real();
		const { token } = await create();
		await post(token, lin);

		const second = await post(token, { ...lin, email: 'other@example.com' });

		expect(second).toMatchObject({ status: 403, data: { invalid: true } });
		expect(await db.user.count({ where: { role: 'learner' } })).toBe(1);
	});

	it('refuses an expired link and a cancelled link', async () => {
		const { post, create, db, invites } = await real();
		const cancelled = await create();
		await invites.cancel({ who: admin, id: cancelled.id });
		const expired = await create();
		await db.invite.update({
			where: { id: expired.id },
			data: { expiresAt: new Date(Date.now() - 1000) }
		});

		for (const token of [cancelled.token, expired.token, 'A'.repeat(43)]) {
			expect(await post(token, lin)).toMatchObject({ status: 403, data: { invalid: true } });
		}
		expect(await db.user.count({ where: { role: 'learner' } })).toBe(0);
	});

	it('refuses the link when it was spent after the form was shown, leaving no Account', async () => {
		const { post, create, db, invites } = await real();
		const { token } = await create();
		// The gate's lookup says yes, then another accept wins the claim.
		const lookup = invites.lookup.bind(invites);
		let first = true;
		vi.spyOn(invites, 'lookup').mockImplementation(async (t, now) => {
			const found = await lookup(t, now);
			if (first) {
				first = false;
				await invites.claim(token, now);
			}
			return found;
		});

		expect(await post(token, lin)).toMatchObject({ status: 403, data: { invalid: true } });
		expect(await db.user.count({ where: { role: 'learner' } })).toBe(0);
		expect(await db.learner.count()).toBe(1);
	});

	it.each([
		['a blank name', { name: '   ' }, 'name', 'Enter a name.'],
		[
			'a name over 100 characters',
			{ name: 'x'.repeat(101) },
			'name',
			'Use at most 100 characters.'
		],
		[
			'a name with a bidi control',
			{ name: 'Lin‮gnahc' },
			'name',
			"This name contains a character that can't be used."
		],
		['a bad email', { email: 'nope' }, 'email', 'Enter an email address like name@example.com.'],
		['a short password', { password: 'short' }, 'password', 'Use at least 12 characters.']
	])('keeps the Invite and answers %s on its field', async (_label, change, field, message) => {
		const { post, create, db, invites } = await real();
		const { token } = await create();

		const result = await post(token, { ...lin, ...change });

		expect(result).toMatchObject({ status: 400, data: { field, message, invalid: false } });
		expect(JSON.stringify(result)).not.toContain(lin.password);
		expect(await invites.lookup(token, new Date())).not.toBeNull();
		expect(await db.user.count({ where: { role: 'learner' } })).toBe(0);
	});

	it('maps Better Auth name codes when the form checks are bypassed', async () => {
		const { post, create, locals } = await real();
		const { token } = await create();
		const { APIError } = await import('better-auth/api');
		for (const [code, field] of [
			['NAME_TOO_LONG', 'name'],
			['NAME_INVALID_CHARACTERS', 'name'],
			['NAME_REQUIRED', 'name']
		] as const) {
			locals.auth = {
				api: {
					signUpEmail: async () => {
						throw new APIError('BAD_REQUEST', { message: 'x', code });
					}
				}
			} as never;
			expect(await post(token, lin)).toMatchObject({ status: 400, data: { field } });
		}
	});

	it('answers a duplicate email without saying the email has an Account, and keeps the Invite', async () => {
		const { post, create, invites } = await real();
		const { token } = await create();

		const result = await post(token, { ...lin, email: 'admin@example.com' });

		expect(result).toMatchObject({
			status: 400,
			data: { field: 'email', message: 'This email cannot be used. Try a different one.' }
		});
		expect(await invites.lookup(token, new Date())).not.toBeNull();
	});

	it('counts every attempt against the caller address', async () => {
		const { post, create } = await real({ throttle: createThrottle() });
		const { token } = await create();
		for (let i = 0; i < 20; i++) {
			expect(await post(token, { ...lin, password: 'x' })).toMatchObject({ status: 400 });
		}

		expect(await post(token, { ...lin, password: 'x' })).toMatchObject({ status: 429 });
	});

	it('does not log the token, the password or the path', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
		const { post, create, locals } = await real();
		const { token } = await create();
		locals.auth = {
			api: {
				signUpEmail: async () => {
					throw new Error(`boom ${token} ${lin.password}`);
				}
			}
		} as never;

		expect(await post(token, lin)).toMatchObject({ status: 500 });

		const logged = spies
			.flatMap((s) => s.mock.calls.flat())
			.map((arg) => inspect(arg, { depth: null }))
			.join('\n');
		expect(logged).not.toContain(token);
		expect(logged).not.toContain(lin.password);
	});

	it('answers a body that is not a form with a fixed 400, not an error', async () => {
		const { accept, event, create } = await real();
		const { token } = await create();
		const broken = {
			...event(token),
			request: {
				formData: async () => {
					throw new TypeError(`Failed to parse body for /invite/${token}`);
				}
			}
		};

		const result = await accept.action(broken as never);

		expect(result).toMatchObject({
			status: 400,
			data: { message: 'The account could not be created. Try again.' }
		});
		expect(JSON.stringify(result)).not.toContain(token);
	});

	it('spends the Invite when registration is open too', async () => {
		const { post, create, locals, invites } = await real();
		(locals.instance as { registrationMode: () => string }).registrationMode = () => 'open';
		const { token } = await create();

		expect(await post(token, lin)).toMatchObject({ status: 303 });
		expect(await invites.lookup(token, new Date())).toBeNull();
	});
});
