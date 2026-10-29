import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import {
	ACCOUNT_LIMITS,
	type AccountActions,
	createAccountActions,
	REFUSAL_CODES,
	type RefusalCode,
	refusalOf
} from './account-actions.ts';
import { INVITE_COOKIE } from './invites.ts';
import { currentSession } from './session-binding.ts';
import { createTestAuth } from './test-auth.ts';
import { createProviderStarts } from './throttle.ts';

const GOOD = 'correct horse battery';
const SECRETS = { github: { clientId: 'id', clientSecret: 'secret' } };
const ADDRESS = '10.0.0.1';

async function harness(options: Parameters<typeof createTestAuth>[0] = {}) {
	const test = await createTestAuth(options);
	const providerStarts = createProviderStarts();
	const accounts = createAccountActions({ auth: test.auth, providerStarts });
	const headersOf = (cookie: string) => new Headers({ cookie });
	const cookieOf = (setCookies: string[]) => setCookies.map((c) => c.split(';')[0]).join('; ');
	return { ...test, accounts, providerStarts, headersOf, cookieOf };
}

const signUpInput = (over: Partial<Parameters<AccountActions['signUp']>[0]> = {}) => ({
	name: 'Ada',
	email: 'ada@example.com',
	password: GOOD,
	address: ADDRESS,
	...over
});

describe('ACCOUNT_LIMITS', () => {
	it('names the name and password limits', () => {
		expect(ACCOUNT_LIMITS).toEqual({ nameMax: 100, passwordMin: 12, passwordMax: 128 });
	});
});

describe('providers', () => {
	it('lists the providers the Instance has, with their names', async () => {
		expect((await harness()).accounts.providers()).toEqual([]);
		const { accounts } = await harness({ socialProviders: SECRETS });
		expect(accounts.providers()).toEqual([{ id: 'github', name: 'GitHub' }]);
	});
});

describe('signUp', () => {
	it('creates the Account and answers the session cookies', async () => {
		const { accounts, auth, db } = await harness();
		const result = await accounts.signUp(
			signUpInput({ name: '  Ada  ', email: ' ada@example.com ' })
		);
		expect(result).toHaveProperty('cookies');
		const cookies = (result as { cookies: string[] }).cookies;
		expect(cookies.length).toBeGreaterThan(0);
		expect(await db.user.findFirstOrThrow()).toMatchObject({
			name: 'Ada',
			email: 'ada@example.com'
		});
		const headers = new Headers({ cookie: cookies.map((c) => c.split(';')[0]).join('; ') });
		expect((await currentSession(auth, headers))?.identity.displayName).toBe('Ada');
	});

	it.each([
		['NAME_REQUIRED', 'name', { name: '   ' }],
		['NAME_TOO_LONG', 'name', { name: 'a'.repeat(101) }],
		['NAME_INVALID_CHARACTERS', 'name', { name: 'A\u0007da' }],
		['INVALID_EMAIL', 'email', { email: 'not-an-email' }],
		['PASSWORD_TOO_SHORT', 'password', { password: 'a'.repeat(11) }],
		['PASSWORD_TOO_LONG', 'password', { password: 'a'.repeat(129) }]
	] as const)('refuses %s on the %s field', async (code, field, over) => {
		const { accounts, db } = await harness();
		expect(await accounts.signUp(signUpInput(over))).toEqual({ refused: code, field });
		expect(await db.user.count()).toBe(0);
	});

	it('checks the name, then the email, then the password', async () => {
		const { accounts } = await harness();
		const all = { name: '', email: 'x', password: 'x' };
		expect(await accounts.signUp(signUpInput(all))).toMatchObject({ refused: 'NAME_REQUIRED' });
		expect(await accounts.signUp(signUpInput({ ...all, name: 'Ada' }))).toMatchObject({
			refused: 'INVALID_EMAIL'
		});
	});

	it('refuses EMAIL_UNAVAILABLE for an email that has an Account', async () => {
		const { accounts } = await harness();
		await accounts.signUp(signUpInput());
		expect(await accounts.signUp(signUpInput({ name: 'Other' }))).toEqual({
			refused: 'EMAIL_UNAVAILABLE',
			field: 'email'
		});
	});

	it('refuses SIGN_UP_CLOSED when the gate says no', async () => {
		const { accounts } = await harness({ admit: () => null });
		expect(await accounts.signUp(signUpInput())).toEqual({ refused: 'SIGN_UP_CLOSED' });
	});

	it('refuses SIGN_UP_FAILED, and logs only the kind of failure', async () => {
		const { accounts, auth } = await harness();
		vi.spyOn(auth.api, 'signUpEmail').mockRejectedValue(
			new Error('secret path /x ada@example.com')
		);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await accounts.signUp(signUpInput())).toEqual({ refused: 'SIGN_UP_FAILED' });
		expect(log.mock.calls.flat().join(' ')).not.toContain('ada@example.com');
		log.mockRestore();
	});

	it('hands an Invite on as the invite cookie, and counts against its own throttle', async () => {
		const seen: (string | undefined)[] = [];
		const { accounts } = await harness({
			admit: ({ inviteToken }) => {
				seen.push(inviteToken);
				return inviteToken === 'good' ? { inviteToken } : null;
			},
			claimInvite: async () => true
		});
		expect(await accounts.signUp(signUpInput({ invite: 'good' }))).toHaveProperty('cookies');
		expect(seen).toContain('good');
		expect(INVITE_COOKIE).toBe('beyondleetcode_invite');
	});

	it('refuses INVITE_INVALID when the gate or the claim says no to an Invite', async () => {
		const { accounts } = await harness({ admit: () => null });
		expect(await accounts.signUp(signUpInput({ invite: 'bad' }))).toEqual({
			refused: 'INVITE_INVALID'
		});
		const lost = await harness({
			admit: ({ inviteToken }) => ({ inviteToken }),
			claimInvite: async () => false
		});
		expect(await lost.accounts.signUp(signUpInput({ invite: 'lost' }))).toEqual({
			refused: 'INVITE_INVALID'
		});
	});

	it('refuses TOO_MANY_ATTEMPTS after 20 from one address, with the seconds to wait', async () => {
		const { accounts } = await harness();
		for (let i = 0; i < 20; i++) await accounts.signUp(signUpInput({ name: '' }));
		const result = await accounts.signUp(signUpInput({ name: '' }));
		expect(result).toMatchObject({ refused: 'TOO_MANY_ATTEMPTS' });
		expect((result as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
		// Another address is untouched.
		expect(await accounts.signUp(signUpInput({ name: '', address: '10.0.0.2' }))).toMatchObject({
			refused: 'NAME_REQUIRED'
		});
	});

	it('keeps Sign up and Accept invite on separate throttles', async () => {
		const { accounts } = await harness();
		for (let i = 0; i < 21; i++) await accounts.signUp(signUpInput({ name: '' }));
		expect(await accounts.signUp(signUpInput({ name: '' }))).toMatchObject({
			refused: 'TOO_MANY_ATTEMPTS'
		});
		expect(await accounts.signUp(signUpInput({ name: '', invite: 't' }))).toMatchObject({
			refused: 'NAME_REQUIRED'
		});
	});
});

describe('signIn', () => {
	it('answers the session cookies for the right password, in any spelling of the email', async () => {
		const { accounts, auth, signUp, headersOf, cookieOf } = await harness();
		await signUp();
		const result = await accounts.signIn({
			email: 'ada@example.com',
			password: GOOD,
			address: ADDRESS
		});
		const cookies = (result as { cookies: string[] }).cookies;
		expect((await currentSession(auth, headersOf(cookieOf(cookies))))?.identity.displayName).toBe(
			'Ada'
		);
		expect(
			await accounts.signIn({ email: 'ADA@example.com', password: GOOD, address: ADDRESS })
		).toHaveProperty('cookies');
	});

	it('refuses WRONG_SIGN_IN for a wrong password, an unknown email and a blank form', async () => {
		const { accounts, signUp } = await harness();
		await signUp();
		const wrong = { refused: 'WRONG_SIGN_IN' };
		expect(
			await accounts.signIn({
				email: 'ada@example.com',
				password: 'nope nope nope',
				address: ADDRESS
			})
		).toEqual(wrong);
		expect(
			await accounts.signIn({ email: 'who@example.com', password: GOOD, address: ADDRESS })
		).toEqual(wrong);
		expect(await accounts.signIn({ email: '', password: '', address: ADDRESS })).toEqual(wrong);
		expect(
			await accounts.signIn({ email: 'ada@example.com', password: '', address: ADDRESS })
		).toEqual(wrong);
	});

	it('refuses the sixth try for one Account from one address, even with the right password', async () => {
		const { accounts, signUp } = await harness();
		await signUp();
		for (let i = 0; i < 5; i++) {
			await accounts.signIn({
				email: 'ada@example.com',
				password: 'nope nope nope',
				address: ADDRESS
			});
		}
		expect(
			await accounts.signIn({ email: 'ada@example.com', password: GOOD, address: ADDRESS })
		).toEqual({
			refused: 'WRONG_SIGN_IN'
		});
	});

	it('limits an unknown email like a known one, whatever its case', async () => {
		const { accounts, auth } = await harness();
		for (let i = 0; i < 5; i++) {
			await accounts.signIn({ email: 'Who@example.com', password: GOOD, address: ADDRESS });
		}
		// The sixth try is refused without reaching Better Auth: it never runs for the throttled email.
		const reached = vi.spyOn(auth.api, 'signInEmail');
		expect(
			await accounts.signIn({ email: 'who@example.com', password: GOOD, address: ADDRESS })
		).toEqual({ refused: 'WRONG_SIGN_IN' });
		expect(reached).not.toHaveBeenCalled();
	});

	it('gives right passwords their attempt back', async () => {
		const { accounts, signUp } = await harness();
		await signUp();
		for (let i = 0; i < 30; i++) {
			expect(
				await accounts.signIn({ email: 'ada@example.com', password: GOOD, address: ADDRESS })
			).toHaveProperty('cookies');
		}
	});

	it('refuses SIGN_IN_FAILED when the lookup or Better Auth fails', async () => {
		const { accounts, auth, signUp } = await harness();
		await signUp();
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(auth.api, 'signInEmail').mockRejectedValueOnce(new Error('db down'));
		expect(
			await accounts.signIn({ email: 'ada@example.com', password: GOOD, address: ADDRESS })
		).toEqual({
			refused: 'SIGN_IN_FAILED'
		});
		const { internalAdapter } = await auth.$context;
		vi.spyOn(internalAdapter, 'findUserByEmail').mockRejectedValueOnce(new Error('db down'));
		expect(
			await accounts.signIn({ email: 'ada@example.com', password: GOOD, address: ADDRESS })
		).toEqual({
			refused: 'SIGN_IN_FAILED'
		});
		log.mockRestore();
	});
});

describe('startProvider', () => {
	it('answers the provider URL and the cookies of the flow, and records the start', async () => {
		const { accounts, providerStarts } = await harness({ socialProviders: SECRETS });
		const result = await accounts.startProvider({
			provider: 'github',
			next: '/',
			address: ADDRESS
		});
		expect(result).toMatchObject({ location: expect.stringMatching(/^https:\/\/github\.com\//) });
		expect((result as { cookies: string[] }).cookies.length).toBeGreaterThan(0);
		expect(providerStarts.size()).toBe(1);
	});

	it('refuses SIGN_IN_FAILED for a provider the Instance lacks', async () => {
		const { accounts } = await harness({ socialProviders: SECRETS });
		expect(
			await accounts.startProvider({ provider: 'google', next: '/', address: ADDRESS })
		).toEqual({
			refused: 'SIGN_IN_FAILED'
		});
		expect(await accounts.startProvider({ provider: '', next: '/', address: ADDRESS })).toEqual({
			refused: 'SIGN_IN_FAILED'
		});
	});

	it('refuses SIGN_IN_FAILED past 20 starts from one address', async () => {
		const { accounts } = await harness({ socialProviders: SECRETS });
		for (let i = 0; i < 20; i++) {
			await accounts.startProvider({ provider: 'github', next: '/', address: ADDRESS });
		}
		expect(
			await accounts.startProvider({ provider: 'github', next: '/', address: ADDRESS })
		).toEqual({
			refused: 'SIGN_IN_FAILED'
		});
	});

	it('refuses SIGN_IN_FAILED when Better Auth fails or names no https URL', async () => {
		const { accounts, auth } = await harness({ socialProviders: SECRETS });
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(auth.api, 'signInSocial').mockRejectedValueOnce(new Error('x'));
		expect(
			await accounts.startProvider({ provider: 'github', next: '/', address: ADDRESS })
		).toEqual({
			refused: 'SIGN_IN_FAILED'
		});
		vi.spyOn(auth.api, 'signInSocial').mockResolvedValueOnce({
			headers: new Headers(),
			response: { url: 'javascript:alert(1)', redirect: true }
		} as never);
		expect(
			await accounts.startProvider({ provider: 'github', next: '/', address: ADDRESS })
		).toEqual({
			refused: 'SIGN_IN_FAILED'
		});
		log.mockRestore();
	});
});

describe('status', () => {
	it('is null without a session', async () => {
		const { accounts, headersOf } = await harness();
		expect(await accounts.status(new Headers())).toBeNull();
		expect(await accounts.status(headersOf('better-auth.session_token=forged.sig'))).toBeNull();
	});

	it('names whether the Account must change its password and has one', async () => {
		const { accounts, db, signUp, headersOf } = await harness();
		const { cookie } = await signUp();
		expect(await accounts.status(headersOf(cookie))).toEqual({ forced: false, hasPassword: true });
		await db.user.updateMany({ data: { mustChangePassword: true } });
		await db.account.updateMany({ where: { providerId: 'credential' }, data: { password: null } });
		expect(await accounts.status(headersOf(cookie))).toEqual({ forced: true, hasPassword: false });
	});
});

describe('changePassword', () => {
	const NEXT = 'brand new password';
	const change = (
		accounts: AccountActions,
		cookie: string,
		over: Partial<Parameters<AccountActions['changePassword']>[0]> = {}
	) =>
		accounts.changePassword({
			headers: new Headers({ cookie }),
			current: GOOD,
			next: NEXT,
			confirm: NEXT,
			address: ADDRESS,
			...over
		});

	it('changes the password, ends the old sessions and answers the new cookies', async () => {
		const { accounts, signUp, auth, headersOf, cookieOf } = await harness();
		const { cookie } = await signUp();
		const result = await change(accounts, cookie);
		expect(result).toMatchObject({ forced: false, flagCleared: true });
		const fresh = cookieOf((result as { cookies: string[] }).cookies);
		expect(await currentSession(auth, headersOf(cookie))).toBeNull();
		expect(await currentSession(auth, headersOf(fresh))).not.toBeNull();
		expect(
			await accounts.signIn({ email: 'ada@example.com', password: NEXT, address: ADDRESS })
		).toHaveProperty('cookies');
	});

	it('clears the must-change flag of a forced Account', async () => {
		const { accounts, signUp, db } = await harness();
		const { cookie } = await signUp();
		await db.user.updateMany({ data: { mustChangePassword: true } });
		expect(await change(accounts, cookie)).toMatchObject({ forced: true, flagCleared: true });
		expect(await db.user.findFirstOrThrow()).toMatchObject({ mustChangePassword: false });
	});

	it('still answers the cookies, with flagCleared false, when clearing the flag fails', async () => {
		const { accounts, signUp, db, auth } = await harness();
		const { cookie } = await signUp();
		await db.user.updateMany({ data: { mustChangePassword: true } });
		const { internalAdapter } = await auth.$context;
		vi.spyOn(internalAdapter, 'updateUser').mockRejectedValueOnce(new Error('x'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = await change(accounts, cookie);
		expect(result).toMatchObject({ forced: true, flagCleared: false });
		expect((result as { cookies: string[] }).cookies.length).toBeGreaterThan(0);
		log.mockRestore();
	});

	it('refuses NOT_SIGNED_IN without a session', async () => {
		const { accounts } = await harness();
		expect(await change(accounts, '')).toEqual({ refused: 'NOT_SIGNED_IN' });
	});

	it('refuses NO_PASSWORD for an Account without one, before counting anything', async () => {
		const { accounts, signUp, db } = await harness();
		const { cookie } = await signUp();
		await db.account.updateMany({ where: { providerId: 'credential' }, data: { password: null } });
		for (let i = 0; i < 10; i++) {
			expect(await change(accounts, cookie)).toEqual({ refused: 'NO_PASSWORD' });
		}
	});

	it('checks the new password before the current one, without spending the budget', async () => {
		const { accounts, signUp } = await harness();
		const { cookie } = await signUp();
		for (let i = 0; i < 10; i++) {
			expect(await change(accounts, cookie, { next: 'short', confirm: 'short' })).toEqual({
				refused: 'PASSWORD_TOO_SHORT',
				field: 'new'
			});
		}
		expect(
			await change(accounts, cookie, { next: 'a'.repeat(129), confirm: 'a'.repeat(129) })
		).toEqual({
			refused: 'PASSWORD_TOO_LONG',
			field: 'new'
		});
		expect(await change(accounts, cookie, { confirm: 'something else entirely' })).toEqual({
			refused: 'PASSWORDS_DO_NOT_MATCH',
			field: 'confirm'
		});
		expect(await change(accounts, cookie)).toMatchObject({ forced: false });
	});

	it('refuses WRONG_CURRENT_PASSWORD for a wrong, blank or over-long current password', async () => {
		const { accounts, signUp } = await harness();
		const { cookie } = await signUp();
		const wrong = { refused: 'WRONG_CURRENT_PASSWORD', field: 'current' };
		expect(await change(accounts, cookie, { current: 'not the password' })).toEqual(wrong);
		expect(await change(accounts, cookie, { current: '' })).toEqual(wrong);
		expect(await change(accounts, cookie, { current: 'a'.repeat(129) })).toEqual(wrong);
	});

	it('refuses WRONG_CURRENT_PASSWORD from the sixth try, even with the right one', async () => {
		const { accounts, signUp } = await harness();
		const { cookie } = await signUp();
		for (let i = 0; i < 5; i++) await change(accounts, cookie, { current: 'not the password' });
		expect(await change(accounts, cookie)).toEqual({
			refused: 'WRONG_CURRENT_PASSWORD',
			field: 'current'
		});
	});

	it('refuses SAME_PASSWORD, comparing the NFKC forms', async () => {
		const { accounts, signUp } = await harness();
		const { cookie } = await signUp({ password: 'ﬁne password here' });
		expect(
			await change(accounts, cookie, {
				current: 'ﬁne password here',
				next: 'fine password here',
				confirm: 'fine password here'
			})
		).toEqual({ refused: 'SAME_PASSWORD', field: 'new' });
	});

	it('refuses NOT_SIGNED_IN when Better Auth answers 401', async () => {
		const { accounts, signUp, auth } = await harness();
		const { cookie } = await signUp();
		vi.spyOn(auth.api, 'changePassword').mockRejectedValueOnce(new APIError('UNAUTHORIZED'));
		expect(await change(accounts, cookie)).toEqual({ refused: 'NOT_SIGNED_IN' });
	});

	it('refuses CHANGE_FAILED, and ends every session', async () => {
		const { accounts, signUp, db, auth } = await harness();
		const { cookie } = await signUp();
		vi.spyOn(auth.api, 'changePassword').mockRejectedValueOnce(new Error('x'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await change(accounts, cookie)).toEqual({ refused: 'CHANGE_FAILED' });
		expect(await db.session.count()).toBe(0);
		log.mockRestore();
	});

	it('refuses CHANGE_UNENDED when the sessions cannot be ended either', async () => {
		const { accounts, signUp, auth } = await harness();
		const { cookie } = await signUp();
		vi.spyOn(auth.api, 'changePassword').mockRejectedValueOnce(new Error('x'));
		const { internalAdapter } = await auth.$context;
		vi.spyOn(internalAdapter, 'deleteUserSessions').mockRejectedValueOnce(new Error('y'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await change(accounts, cookie)).toEqual({ refused: 'CHANGE_UNENDED' });
		log.mockRestore();
	});
});

describe('signOut', () => {
	it('ends the session and answers the clearing cookies', async () => {
		const { accounts, signUp, auth, db, headersOf } = await harness();
		const { cookie } = await signUp();
		const result = await accounts.signOut({ headers: headersOf(cookie) });
		expect((result as { cookies: string[] }).cookies.length).toBeGreaterThan(0);
		expect(await db.session.count()).toBe(0);
		expect(await currentSession(auth, headersOf(cookie))).toBeNull();
	});

	it('refuses SIGN_OUT_FAILED when it fails for a user free to go on', async () => {
		const { accounts, signUp, auth, headersOf } = await harness();
		const { cookie } = await signUp();
		vi.spyOn(auth.api, 'signOut').mockRejectedValueOnce(new Error('x'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await accounts.signOut({ headers: headersOf(cookie) })).toEqual({
			refused: 'SIGN_OUT_FAILED'
		});
		log.mockRestore();
	});

	it('refuses MUST_CHANGE_HOLD for a user who must change their password, or whose state is unreadable', async () => {
		const { accounts, signUp, db, auth, headersOf } = await harness();
		const { cookie } = await signUp();
		await db.user.updateMany({ data: { mustChangePassword: true } });
		const signOut = vi.spyOn(auth.api, 'signOut').mockRejectedValue(new Error('x'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await accounts.signOut({ headers: headersOf(cookie) })).toEqual({
			refused: 'MUST_CHANGE_HOLD'
		});
		await db.user.updateMany({ data: { mustChangePassword: false } });
		vi.spyOn(auth.api, 'getSession').mockRejectedValueOnce(new Error('y'));
		expect(await accounts.signOut({ headers: headersOf(cookie) })).toEqual({
			refused: 'MUST_CHANGE_HOLD'
		});
		signOut.mockRestore();
		log.mockRestore();
	});
});

describe('refusalOf', () => {
	it('maps the Better Auth codes the forms know, and nothing else', () => {
		const code = (c: string) => new APIError('BAD_REQUEST', { message: 'm', code: c });
		expect(refusalOf(code('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'))).toEqual({
			refused: 'EMAIL_UNAVAILABLE',
			field: 'email'
		});
		expect(refusalOf(code('NAME_REQUIRED'))).toEqual({ refused: 'NAME_REQUIRED', field: 'name' });
		expect(refusalOf(code('NAME_TOO_LONG'))).toEqual({ refused: 'NAME_TOO_LONG', field: 'name' });
		expect(refusalOf(new APIError('FORBIDDEN', { message: 'm', code: 'X' }))).toEqual({
			refused: 'SIGN_UP_CLOSED'
		});
		expect(refusalOf(code('SOMETHING_ELSE'))).toBeNull();
		expect(refusalOf(new Error('x'))).toBeNull();
	});
});

describe('REFUSAL_CODES', () => {
	it('is every code the tests above cover', () => {
		const covered: RefusalCode[] = [
			'WRONG_SIGN_IN',
			'SIGN_IN_FAILED',
			'SIGN_UP_FAILED',
			'NAME_REQUIRED',
			'NAME_TOO_LONG',
			'NAME_INVALID_CHARACTERS',
			'INVALID_EMAIL',
			'PASSWORD_TOO_SHORT',
			'PASSWORD_TOO_LONG',
			'EMAIL_UNAVAILABLE',
			'SIGN_UP_CLOSED',
			'INVITE_INVALID',
			'TOO_MANY_ATTEMPTS',
			'WRONG_CURRENT_PASSWORD',
			'PASSWORDS_DO_NOT_MATCH',
			'NO_PASSWORD',
			'SAME_PASSWORD',
			'CHANGE_FAILED',
			'CHANGE_UNENDED',
			'NOT_SIGNED_IN',
			'SIGN_OUT_FAILED',
			'MUST_CHANGE_HOLD'
		];
		expect([...REFUSAL_CODES].sort()).toEqual([...covered].sort());
	});
});
