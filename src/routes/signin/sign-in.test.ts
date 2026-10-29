import { createHash } from 'node:crypto';
import { isRedirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMultiUserIdentity } from '#lib/server/identity/multi-user.js';
import { createTestAuth } from '#lib/server/identity/test-auth.js';
import { createProviderStarts, createThrottle } from '#lib/server/identity/throttle.js';
import { createSignIn, landing, providerNotice } from './sign-in';

afterEach(() => vi.restoreAllMocks());

const SESSION_COOKIE =
	'better-auth.session_token=abc.def%3D; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax';
const ada = { email: 'ada@example.com', password: 'correct horse battery' };
const WRONG = 'Email or password is wrong.';
const FAILED = 'Signing in failed. Try again.';

type Form = Record<string, string>;

function formOf(values: Form) {
	const body = new FormData();
	for (const [key, value] of Object.entries(values)) body.set(key, value);
	return body;
}

const unauthorized = () =>
	new APIError('UNAUTHORIZED', {
		message: 'Invalid email or password',
		code: 'INVALID_EMAIL_OR_PASSWORD'
	});

/** The request event the Sign in page reads; `locals.auth` is whatever the test passes. */
function harness(
	options: {
		auth?: unknown;
		/** The Account the email names, by the id Better Auth would find; none by default. */
		accounts?: Record<string, string>;
		/** Which passwords are right, by email. */
		passwords?: Record<string, string>;
		registration?: 'open' | 'invite';
		identity?: unknown;
		throttle?: ReturnType<typeof createThrottle>;
		address?: string | (() => string);
		next?: string | null;
	} = {}
) {
	const accounts = options.accounts ?? { 'ada@example.com': 'user-ada' };
	const passwords = options.passwords ?? { 'ada@example.com': ada.password };
	const findUserByEmail = vi.fn(async (email: string) =>
		accounts[email] ? { user: { id: accounts[email] }, accounts: [] } : null
	);
	const signInEmail = vi.fn(async ({ body }: { body: { email: string; password: string } }) => {
		if (passwords[body.email.toLowerCase()] !== body.password) throw unauthorized();
		const headers = new Headers();
		headers.append('set-cookie', SESSION_COOKIE);
		return { headers, response: {} };
	});
	const auth =
		'auth' in options
			? options.auth
			: {
					api: { signInEmail },
					$context: Promise.resolve({ internalAdapter: { findUserByEmail } })
				};
	const throttle = options.throttle ?? createThrottle();
	const signIn = createSignIn(throttle);
	const cookies = { set: vi.fn() };
	const setHeaders = vi.fn();
	const address = options.address ?? '203.0.113.7';
	const locals = {
		instance: { registrationMode: () => options.registration ?? 'open' },
		auth,
		identity: options.identity
	};
	const url = new URL(
		`http://localhost/signin${options.next === undefined || options.next === null ? '' : `?next=${encodeURIComponent(options.next)}`}`
	);
	const event = (values: Form) => ({
		request: { formData: async () => formOf(values) },
		locals,
		cookies,
		setHeaders,
		url,
		getClientAddress: typeof address === 'function' ? address : () => address
	});
	async function post(values: Form) {
		try {
			return await signIn.action(event(values) as never);
		} catch (thrown) {
			if (isRedirect(thrown)) return thrown;
			throw thrown;
		}
	}
	function load() {
		try {
			return signIn.load({ locals, url } as never);
		} catch (thrown) {
			if (isRedirect(thrown)) return thrown;
			throw thrown;
		}
	}
	return { signIn, signInEmail, findUserByEmail, cookies, setHeaders, post, load, throttle };
}

describe('landing: where a sign-in goes', () => {
	it.each([
		['/topics/stacks', '/topics/stacks'],
		['/problems/p?tab=hints#top', '/problems/p?tab=hints#top'],
		['/topics/%E6%97%A5', '/topics/%E6%97%A5'],
		['/topics/日本?q=é', '/topics/%E6%97%A5%E6%9C%AC?q=%C3%A9'],
		['/ok ', '/ok%20'],
		[null, '/'],
		['', '/'],
		['/', '/']
	])('%j -> %j', (next, expected) => {
		expect(landing(next)).toBe(expected);
	});

	it.each([
		['//evil.example'],
		['//evil.example/path'],
		['/\\evil.example'],
		['\\\\evil.example'],
		['\\/evil.example'],
		['https://evil.example'],
		['http://evil.example/x'],
		['javascript:alert(1)'],
		['data:text/html,x'],
		['evil.example'],
		['topics'],
		['/ok\nhttps://evil.example'],
		['/ok\r\nSet-Cookie: a=b'],
		['/\t/evil.example'],
		['\t//evil.example'],
		['/\u0000'],
		[' /ok']
	])('never leaves this site: %j -> the Map', (next) => {
		expect(landing(next)).toBe('/');
	});

	it.each([
		['/signin'],
		['/signin?next=/topics/stacks'],
		['/signin/'],
		['/SignIn?x'],
		['/%73ignin'],
		['/signup'],
		['/signup?x=1']
	])('never lands on a sign-in or sign-up page: %j -> the Map', (next) => {
		expect(landing(next)).toBe('/');
	});

	it('answers with text a Location header can hold, even for a lone surrogate', () => {
		expect(landing('/\ud800')).toBe('/');
	});

	it('keeps a page whose name merely starts with signin', () => {
		expect(landing('/signing-off')).toBe('/signing-off');
	});
});

describe('the page', () => {
	it('offers Create an account while the Registration Mode is open', () => {
		expect(harness({ registration: 'open' }).load()).toMatchObject({ open: true });
	});

	it('offers no sign-up link while the Registration Mode is invite-only', () => {
		expect(harness({ registration: 'invite' }).load()).toMatchObject({ open: false });
	});

	it('reads the Registration Mode on every request: closing sign-up takes the link away at once', () => {
		let mode: 'open' | 'invite' = 'open';
		const { signIn } = harness();
		const locals = { instance: { registrationMode: () => mode } };
		const url = new URL('http://localhost/signin');

		expect(signIn.load({ locals, url } as never)).toMatchObject({ open: true });
		mode = 'invite';
		expect(signIn.load({ locals, url } as never)).toMatchObject({ open: false });
		mode = 'open';
		expect(signIn.load({ locals, url } as never)).toMatchObject({ open: true });
	});

	it('sends someone who is already signed in to the page they asked for, or the Map', () => {
		expect(harness({ identity: { learnerId: 'l1' }, next: '/topics/stacks' }).load()).toMatchObject(
			{ status: 303, location: '/topics/stacks' }
		);
		expect(harness({ identity: { learnerId: 'l1' } }).load()).toMatchObject({
			status: 303,
			location: '/'
		});
	});

	it('does not send a signed-in visitor off the site, or round and round Sign in', () => {
		for (const next of ['//evil.example', 'https://evil.example', '/signin?next=/signin']) {
			expect(harness({ identity: { learnerId: 'l1' }, next }).load()).toMatchObject({
				status: 303,
				location: '/'
			});
		}
	});
});

describe('signing in', () => {
	it('signs in with the typed email and password, forwards the session cookie and lands on the Map', async () => {
		const { post, signInEmail, cookies } = harness();

		const result = await post(ada);

		expect(signInEmail).toHaveBeenCalledOnce();
		expect(signInEmail).toHaveBeenCalledWith({ body: ada, returnHeaders: true });
		expect(cookies.set).toHaveBeenCalledWith(
			'better-auth.session_token',
			'abc.def=',
			expect.objectContaining({ httpOnly: true, path: '/', secure: false })
		);
		expect(result).toMatchObject({ status: 303, location: '/' });
	});

	it('returns to the page the visitor asked for', async () => {
		const { post } = harness({ next: '/topics/stacks?x=1' });

		expect(await post(ada)).toMatchObject({ status: 303, location: '/topics/stacks?x=1' });
	});

	it('goes to the Map instead of a next that is not a path on this site', async () => {
		for (const next of ['//evil.example', 'https://evil.example', '/\\evil.example', '/signin']) {
			const { post } = harness({ next });
			expect(await post(ada), next).toMatchObject({ status: 303, location: '/' });
		}
	});

	it('passes nothing else on: not a remember-me flag, a callback URL, a role or any other field', async () => {
		const { post, signInEmail } = harness();

		await post({ ...ada, rememberMe: 'false', callbackURL: 'https://evil.example', role: 'admin' });

		expect(signInEmail).toHaveBeenCalledOnce();
		expect(signInEmail.mock.calls[0][0]).toEqual({ body: ada, returnHeaders: true });
	});

	it('looks the Account up the way Better Auth does: lowercased, not trimmed, as typed otherwise', async () => {
		const { post, findUserByEmail, signInEmail } = harness();

		await post({ email: 'Ada@Example.COM', password: ada.password });
		await post({ email: ' ada@example.com', password: ada.password });

		expect(findUserByEmail.mock.calls.map(([email]) => email)).toEqual([
			'ada@example.com',
			' ada@example.com'
		]);
		// What Better Auth is asked to sign in is what was typed, so both agree on the Account.
		expect(signInEmail.mock.calls[0][0].body.email).toBe('Ada@Example.COM');
		expect(signInEmail.mock.calls[1][0].body.email).toBe(' ada@example.com');
	});

	it('does nothing for someone who is already signed in', async () => {
		const { post, signInEmail, findUserByEmail } = harness({
			identity: { learnerId: 'l1' },
			next: '/topics/stacks'
		});

		expect(await post(ada)).toMatchObject({ status: 303, location: '/topics/stacks' });
		expect(signInEmail).not.toHaveBeenCalled();
		expect(findUserByEmail).not.toHaveBeenCalled();
	});

	it('does not log the password, the email or the cookies', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
		const { post } = harness();
		await post(ada);
		await post({ ...ada, password: 'wrong wrong wrong' });
		const failing = harness({
			auth: {
				api: {
					signInEmail: async () => {
						throw new Error(`insert failed for ${ada.email} / ${ada.password} abc.def`);
					}
				},
				$context: Promise.resolve({ internalAdapter: { findUserByEmail: async () => null } })
			}
		});
		await failing.post(ada);

		expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toMatch(
			/correct horse|wrong wrong|abc\.def|ada@example/
		);
	});
});

describe('one message for everything that is wrong with a sign-in', () => {
	const refused = (result: unknown) => JSON.stringify(result);

	it('says the same thing, with the same status, for a wrong password, no such account and a blank form', async () => {
		const wrong = await harness().post({ ...ada, password: 'not the password' });
		const unknown = await harness().post({ email: 'nobody@example.com', password: ada.password });
		const blank = await harness().post({ email: '', password: '' });
		const noEmail = await harness().post({ password: ada.password });
		const notAnEmail = await harness().post({ email: 'ada', password: ada.password });

		for (const result of [wrong, unknown, blank, noEmail, notAnEmail]) {
			expect(result).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
		}
		// Byte for byte the same apart from the typed email.
		expect(refused(wrong)).toBe(refused(unknown).replace('nobody@example.com', 'ada@example.com'));
	});

	it('keeps the typed email but never the password', async () => {
		const result = await harness().post({ email: 'ada@example.com', password: 'hunter2-hunter2' });

		expect(result).toMatchObject({
			status: 400,
			data: { email: 'ada@example.com', message: WRONG }
		});
		expect(refused(result)).not.toContain('hunter2');
		expect(Object.keys((result as { data: object }).data).sort()).toEqual([
			'email',
			'message',
			'wrong'
		]);
	});

	it('does not ask Better Auth anything when the form is blank, but still counts the attempt', async () => {
		const { post, signInEmail, throttle } = harness();
		const attempt = vi.spyOn(throttle, 'attempt');

		await post({ email: '', password: '' });
		await post({ email: ada.email, password: '' });

		expect(signInEmail).not.toHaveBeenCalled();
		expect(attempt).toHaveBeenCalledTimes(2);
	});

	it.each([
		['INVALID_EMAIL', 'BAD_REQUEST'],
		['PASSWORD_TOO_LONG', 'BAD_REQUEST'],
		['INVALID_EMAIL_OR_PASSWORD', 'UNAUTHORIZED']
	] as const)('treats Better Auth’s %s as the same wrong sign-in', async (code, status) => {
		const { post } = harness({
			auth: {
				api: {
					signInEmail: async () => {
						throw new APIError(status, { message: `Better Auth says ${code}`, code });
					}
				},
				$context: Promise.resolve({ internalAdapter: { findUserByEmail: async () => null } })
			}
		});

		const result = await post(ada);

		expect(result).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
		expect(refused(result)).not.toContain(code);
	});

	it('hides any other failure behind a fixed message and logs only the kind of failure', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = Object.assign(new Error('SQLITE_BUSY at /data/app.db: SELECT FROM "User"'), {
			code: 'SQLITE_BUSY'
		});
		const { post, cookies } = harness({
			auth: {
				api: {
					signInEmail: async () => {
						throw failure;
					}
				},
				$context: Promise.resolve({ internalAdapter: { findUserByEmail: async () => null } })
			}
		});

		const result = await post(ada);

		expect(result).toMatchObject({ status: 500, data: { message: FAILED, wrong: false } });
		expect(refused(result)).not.toMatch(/SQLITE|app\.db|SELECT/);
		expect(JSON.stringify(spy.mock.calls)).not.toMatch(/app\.db|SELECT|ada@example/);
		expect(spy).toHaveBeenCalledOnce();
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('answers a refusal it does not know (a ban, an unverified email) as a failure, not as a reason', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { post } = harness({
			auth: {
				api: {
					signInEmail: async () => {
						throw new APIError('FORBIDDEN', {
							message: 'You have been banned from this application',
							code: 'BANNED_USER'
						});
					}
				},
				$context: Promise.resolve({ internalAdapter: { findUserByEmail: async () => null } })
			}
		});

		const result = await post(ada);

		expect(result).toMatchObject({ status: 500, data: { message: FAILED, wrong: false } });
		expect(refused(result)).not.toMatch(/banned/i);
	});

	it('fails without asking Better Auth when the Account lookup fails', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const signInEmail = vi.fn();
		const { post } = harness({
			auth: {
				api: { signInEmail },
				$context: Promise.resolve({
					internalAdapter: {
						findUserByEmail: async () => {
							throw Object.assign(new Error('SELECT * FROM "User" WHERE email = ada@example.com'), {
								code: 'SQLITE_BUSY'
							});
						}
					}
				})
			}
		});

		const result = await post(ada);

		expect(result).toMatchObject({ status: 500, data: { message: FAILED, wrong: false } });
		expect(signInEmail).not.toHaveBeenCalled();
		expect(JSON.stringify(spy.mock.calls)).not.toMatch(/SELECT|ada@example/);
	});

	it('is unavailable, not a crash, when the request has no Better Auth', async () => {
		const { post } = harness({ auth: undefined });

		expect(await post(ada)).toMatchObject({ status: 503, data: { message: FAILED, wrong: false } });
	});
});

describe('the sign-in limits', () => {
	const wrongPassword = { ...ada, password: 'not the password' };

	it('refuses the sixth wrong password for an Account from one address, even with the right one, with the one message', async () => {
		const { post, signInEmail } = harness();
		for (let i = 0; i < 5; i++) await post(wrongPassword);
		signInEmail.mockClear();

		const withRightPassword = await post(ada);
		const withWrongPassword = await post(wrongPassword);

		expect(withRightPassword).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
		expect(withWrongPassword).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
		expect(signInEmail).not.toHaveBeenCalled();
	});

	it('answers a throttled attempt exactly like a wrong password: same status, same text, no Retry-After', async () => {
		const throttled = harness();
		for (let i = 0; i < 5; i++) await throttled.post(wrongPassword);

		const refusal = await throttled.post(wrongPassword);
		const ordinary = await harness().post(wrongPassword);

		expect(JSON.stringify(refusal)).toBe(JSON.stringify(ordinary));
		expect(throttled.setHeaders).not.toHaveBeenCalled();
	});

	it('counts the attempt against the Account Better Auth would sign in and the address, a digest of the email when there is no Account, and the address alone for a blank form', async () => {
		const throttle = createThrottle();
		const attempt = vi.spyOn(throttle, 'attempt');
		const { post } = harness({ throttle, address: '203.0.113.9' });

		await post(wrongPassword);
		await post({ email: 'Nobody@Example.com', password: 'x' });
		await post({ email: '', password: '' });

		const inputs = attempt.mock.calls.map(([input]) => input);
		expect(inputs[0]).toEqual({ address: '203.0.113.9', accountId: 'user-ada' });
		expect(inputs[1]).toEqual({
			address: '203.0.113.9',
			accountId: null,
			unknownEmail: createHash('sha256').update('nobody@example.com').digest('hex')
		});
		expect(inputs[2]).toEqual({ address: '203.0.113.9', accountId: null });
	});

	it('never hands the throttle an email, and keys unknown emails the way the lookup spells them', async () => {
		const throttle = createThrottle();
		const attempt = vi.spyOn(throttle, 'attempt');
		const { post } = harness({ throttle });

		await post({ email: 'nobody@example.com', password: 'x' });
		await post({ email: 'NOBODY@example.com', password: 'x' });
		await post({ email: ' nobody@example.com', password: 'x' });

		const keys = attempt.mock.calls.map(([input]) => input.unknownEmail);
		expect(JSON.stringify(keys)).not.toContain('nobody@');
		// Lowercased like Better Auth's lookup, so one spelling cannot escape the other's count; not trimmed.
		expect(keys[0]).toBe(keys[1]);
		expect(keys[2]).not.toBe(keys[0]);
	});

	it('refuses the 6th wrong try for an unknown email exactly as for a known one, from one address', async () => {
		const unknown = { email: 'nobody@example.com', password: 'not the password' };
		for (const typed of [wrongPassword, unknown]) {
			const { post, signInEmail } = harness();
			const answers = [];
			for (let i = 0; i < 6; i++) answers.push(await post(typed));

			// Five were asked (and wrong); the sixth was refused before the password was looked at.
			expect(signInEmail, typed.email).toHaveBeenCalledTimes(5);
			expect(answers.map((a) => (a as { status: number }).status)).toEqual([
				400, 400, 400, 400, 400, 400
			]);
		}
	});

	it('keeps a known Account limited while a flood of made-up emails fills the unknown-email counters', async () => {
		const throttle = createThrottle({ maxKeys: 20, addressLimit: 1_000_000 });
		const { post, signInEmail } = harness({ throttle });
		for (let i = 0; i < 200; i++) await post({ email: `made-up-${i}@example.com`, password: 'x' });
		signInEmail.mockClear();

		for (let i = 0; i < 6; i++) await post(wrongPassword);

		// Five were asked and wrong; the sixth was refused before the password was looked at.
		expect(signInEmail).toHaveBeenCalledTimes(5);
	});

	it('limits an unknown email across many addresses at 50, like a known one', async () => {
		const throttle = createThrottle();
		const unknown = { email: 'nobody@example.com', password: 'x' };
		let asked = 0;
		for (let i = 0; i < 52; i++) {
			const { post, signInEmail } = harness({ throttle, address: `198.51.100.${i}` });
			await post(unknown);
			asked += signInEmail.mock.calls.length;
		}

		expect(asked).toBe(50);
	});

	it('counts before anything else: a flood of guesses at unknown emails is limited per address at 20', async () => {
		const { post, signInEmail } = harness();
		for (let i = 0; i < 20; i++) await post({ email: `nobody${i}@example.com`, password: 'x' });
		signInEmail.mockClear();

		const result = await post(ada);

		expect(result).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
		expect(signInEmail).not.toHaveBeenCalled();
	});

	it('keeps one address from using up another one', async () => {
		const throttle = createThrottle();
		const first = harness({ throttle, address: '203.0.113.1' });
		for (let i = 0; i < 5; i++) await first.post(wrongPassword);

		const second = harness({ throttle, address: '203.0.113.2' });

		expect(await second.post(ada)).toMatchObject({ status: 303 });
	});

	it('limits one Account across many addresses at 50', async () => {
		const throttle = createThrottle();
		for (let i = 0; i < 50; i++) {
			await harness({ throttle, address: `198.51.100.${i}` }).post(wrongPassword);
		}

		const result = await harness({ throttle, address: '203.0.113.200' }).post(ada);

		expect(result).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
	});

	it('does not let right passwords use up the budget: a class behind one address signs in 30 times', async () => {
		const accounts: Record<string, string> = {};
		const passwords: Record<string, string> = {};
		for (let i = 0; i < 30; i++) {
			accounts[`student${i}@example.com`] = `user-${i}`;
			passwords[`student${i}@example.com`] = 'correct horse battery';
		}
		const throttle = createThrottle();
		const { post } = harness({ throttle, accounts, passwords, address: '203.0.113.50' });

		for (let i = 0; i < 30; i++) {
			const result = await post({
				email: `student${i}@example.com`,
				password: 'correct horse battery'
			});
			expect(result, `student ${i}`).toMatchObject({ status: 303, location: '/' });
		}
	});

	it('does not let a valid Account reset an attacker’s guesses at another', async () => {
		const accounts = { 'ada@example.com': 'user-ada', 'eve@example.com': 'user-eve' };
		const passwords = { 'ada@example.com': ada.password, 'eve@example.com': 'eve-eve-eve-eve' };
		const throttle = createThrottle();
		const { post } = harness({ throttle, accounts, passwords });
		for (let i = 0; i < 5; i++) await post(wrongPassword);

		// The attacker signs in as themselves, over and over.
		for (let i = 0; i < 10; i++)
			await post({ email: 'eve@example.com', password: 'eve-eve-eve-eve' });

		expect(await post(ada)).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
	});

	it('forgives an Account’s own typos at an address once the right password is entered', async () => {
		const { post } = harness();
		for (let i = 0; i < 4; i++) await post(wrongPassword);
		expect(await post(ada)).toMatchObject({ status: 303 });

		for (let i = 0; i < 5; i++) await post(wrongPassword);

		expect(await post(ada)).toMatchObject({ status: 400 });
	});

	it('keeps all unreadable addresses in one shared bucket, so the limit still holds', async () => {
		const throwing = () => {
			throw new Error('no address');
		};
		const throttle = createThrottle();
		for (let i = 0; i < 20; i++) {
			await harness({ throttle, address: throwing }).post({
				email: `nobody${i}@example.com`,
				password: 'x'
			});
		}

		const result = await harness({ throttle, address: throwing }).post(ada);

		expect(result).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
	});

	it('uses a throttle of its own: the sign-up limit and this one never share counters', async () => {
		const signUpLike = createThrottle();
		for (let i = 0; i < 20; i++) signUpLike.attempt({ address: '203.0.113.7', accountId: null });

		expect(await harness().post(ada)).toMatchObject({ status: 303 });
	});
});

describe('with the real Better Auth', () => {
	const password = 'correct horse battery';

	async function real() {
		const { db, auth, signUp } = await createTestAuth();
		await signUp({ password });
		const signIn = createSignIn(createThrottle());
		const cookies = new Map<string, string>();
		const jar = {
			set: (name: string, value: string) => void cookies.set(name, value)
		};
		const post = async (values: Form, next = '/') => {
			const event = {
				request: { formData: async () => formOf(values) },
				locals: { instance: { registrationMode: () => 'open' }, auth },
				cookies: jar,
				setHeaders: () => {},
				url: new URL(`http://localhost/signin?next=${encodeURIComponent(next)}`),
				getClientAddress: () => '203.0.113.7'
			};
			try {
				return await signIn.action(event as never);
			} catch (thrown) {
				if (isRedirect(thrown)) return thrown;
				throw thrown;
			}
		};
		const whoIs = async () => {
			const headers = new Headers({
				cookie: [...cookies]
					.map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
					.join('; ')
			});
			return createMultiUserIdentity(auth).resolve({
				cookies: { get: () => undefined },
				request: { headers }
			});
		};
		return { db, auth, post, cookies, whoIs };
	}

	it('signs in the Account, whatever case the email is typed in, and the session names its Learner', async () => {
		const { post, whoIs, cookies } = await real();

		const result = await post({ email: 'Ada@Example.com', password }, '/topics/stacks');

		expect(result).toMatchObject({ status: 303, location: '/topics/stacks' });
		expect([...cookies.keys()]).toContain('better-auth.session_token');
		expect(await whoIs()).toMatchObject({ displayName: 'Ada', role: 'learner' });
	});

	it('refuses a wrong password and an unknown account with the same answer, and sets no cookie', async () => {
		const { post, cookies } = await real();

		const wrong = await post({ email: 'ada@example.com', password: 'wrong wrong wrong' });
		const unknown = await post({ email: 'nobody@example.com', password: 'wrong wrong wrong' });

		expect(wrong).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
		expect(JSON.stringify(wrong)).toBe(
			JSON.stringify(unknown).replace('nobody@example.com', 'ada@example.com')
		);
		expect(cookies.size).toBe(0);
	});

	it('refuses the sixth wrong password even when the sixth is the right one', async () => {
		const { post, cookies } = await real();
		for (let i = 0; i < 5; i++)
			await post({ email: 'ada@example.com', password: 'wrong wrong wrong' });

		const result = await post({ email: 'ada@example.com', password });

		expect(result).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
		expect(cookies.size).toBe(0);
	});

	it('maps the whole of Better Auth’s email check: a space-padded email is the one wrong message', async () => {
		const { post, cookies } = await real();

		const result = await post({ email: ' ada@example.com ', password });

		expect(result).toMatchObject({ status: 400, data: { message: WRONG, wrong: true } });
		expect(cookies.size).toBe(0);
	});
});

describe('provider buttons', () => {
	const STATE_COOKIE = 'better-auth.state=abc.def; Max-Age=600; Path=/; HttpOnly; SameSite=Lax';
	const authorize = 'https://github.com/login/oauth/authorize?client_id=x&state=abc';
	function withProviders(ids: string[] = ['github'], url = authorize) {
		const signInSocial = vi.fn(async (_input: unknown) => {
			const headers = new Headers();
			headers.append('set-cookie', STATE_COOKIE);
			return { headers, response: { url, redirect: true } };
		});
		const socialProviders = Object.fromEntries(ids.map((id) => [id, {}]));
		const auth = {
			options: { socialProviders },
			api: { signInSocial, signInEmail: vi.fn() },
			$context: Promise.resolve({ internalAdapter: { findUserByEmail: vi.fn() } })
		};
		return { signInSocial, auth, ...harness({ auth }) };
	}

	it('lists a button per provider the Instance has, and none otherwise', () => {
		expect((withProviders([]).load() as { providers: unknown[] }).providers).toEqual([]);
		expect((harness().load() as { providers: unknown[] }).providers).toEqual([]);
		expect(
			(withProviders(['github', 'google']).load() as { providers: unknown[] }).providers
		).toEqual([
			{ id: 'github', name: 'GitHub' },
			{ id: 'google', name: 'Google' }
		]);
	});

	it('starts the provider with only its id and the redirects the page chooses, and sends the visitor there', async () => {
		const h = withProviders();

		const result = (await h.post({ provider: 'github' })) as { status: number; location: string };

		expect(result.status).toBe(303);
		expect(result.location).toBe(authorize);
		expect(h.signInSocial).toHaveBeenCalledExactlyOnceWith({
			body: { provider: 'github', callbackURL: '/', errorCallbackURL: '/signin' },
			returnHeaders: true
		});
		expect(h.cookies.set).toHaveBeenCalledWith(
			'better-auth.state',
			'abc.def',
			expect.objectContaining({ path: '/', httpOnly: true })
		);
		expect(h.signInEmail).not.toHaveBeenCalled();
	});

	it('returns to the page the visitor asked for, and never to another site', async () => {
		const own = withProviders(['github'], authorize);
		const ownResult = harness({ auth: own.auth, next: '/topics/stacks' });
		await ownResult.post({ provider: 'github' });
		expect(own.signInSocial).toHaveBeenLastCalledWith(
			expect.objectContaining({ body: expect.objectContaining({ callbackURL: '/topics/stacks' }) })
		);

		const evil = withProviders();
		const evilResult = harness({ auth: evil.auth, next: '//evil.example' });
		await evilResult.post({ provider: 'github' });
		expect(evil.signInSocial).toHaveBeenLastCalledWith(
			expect.objectContaining({ body: expect.objectContaining({ callbackURL: '/' }) })
		);
	});

	it('refuses a provider the Instance does not have, asking Better Auth nothing', async () => {
		const h = withProviders(['github']);

		const result = (await h.post({ provider: 'google' })) as { status: number; data: unknown };

		expect(result.status).toBe(400);
		expect(result.data).toMatchObject({ message: 'Signing in failed. Try again.' });
		expect(h.signInSocial).not.toHaveBeenCalled();
	});

	it('does not take what the form says about redirects, tokens or sign-up', async () => {
		const h = withProviders();

		await h.post({
			provider: 'github',
			callbackURL: 'https://evil.example',
			idToken: 'x',
			requestSignUp: 'true'
		});

		expect(h.signInSocial).toHaveBeenCalledExactlyOnceWith({
			body: { provider: 'github', callbackURL: '/', errorCallbackURL: '/signin' },
			returnHeaders: true
		});
	});

	it('is a failure, with a fixed text, when the provider answers with something that is not an https address', async () => {
		const h = withProviders(['github'], 'javascript:alert(1)');

		const result = (await h.post({ provider: 'github' })) as { status: number };

		expect(result.status).toBe(500);
		expect(h.cookies.set).not.toHaveBeenCalled();
	});

	it('hides a failure behind a fixed message and logs only the kind', async () => {
		const h = withProviders();
		h.signInSocial.mockRejectedValueOnce(new Error('/secret/path'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = (await h.post({ provider: 'github' })) as { status: number; data: unknown };

		expect(result.status).toBe(500);
		expect(JSON.stringify(result.data)).not.toContain('/secret/path');
		expect(JSON.stringify(log.mock.calls)).not.toContain('/secret/path');
	});

	it('limits starts per address, apart from the password attempts', async () => {
		const h = withProviders();
		let refused = 0;
		for (let i = 0; i < 40; i++) {
			const result = (await h.post({ provider: 'github' })) as { status: number };
			if (result.status === 400) refused++;
		}
		expect(refused).toBeGreaterThan(0);
		expect(h.signInSocial.mock.calls.length).toBeLessThan(40);
		// Password attempts from the same address are unaffected.
		expect(h.signInEmail).not.toHaveBeenCalled();
	});

	it('does nothing for someone who is already signed in', async () => {
		const h = harness({ auth: withProviders().auth, identity: { learnerId: 'l' } });
		const result = (await h.post({ provider: 'github' })) as { status: number; location: string };
		expect(result.status).toBe(303);
		expect(result.location).toBe('/');
	});
});

describe('what the page says about a refused provider sign-in', () => {
	it('has a fixed text for each kind of refusal and nothing for a plain visit', () => {
		expect(providerNotice(null)).toBeNull();
		expect(providerNotice('SIGN_UP_CLOSED')).toMatch(/by invite/);
		expect(providerNotice('account_not_linked')).toMatch(/already exists/);
		expect(providerNotice('anything_else')).toBe(
			'Signing in with that account did not work. Try again.'
		);
	});

	it('never shows what the query holds', () => {
		for (const code of ['<script>alert(1)</script>', 'x'.repeat(5000), 'SIGN_UP_CLOSED<b>']) {
			expect(providerNotice(code) ?? '').not.toContain(code.slice(0, 20));
		}
	});

	it('is in the load, from the error in the address', () => {
		const h = harness();
		const url = new URL('http://localhost/signin?error=SIGN_UP_CLOSED&error_description=Evil');
		const data = h.signIn.load({
			locals: { instance: { registrationMode: () => 'invite' }, auth: undefined },
			url
		} as never) as { notice: string | null };
		expect(data.notice).toMatch(/by invite/);
		expect(JSON.stringify(data)).not.toContain('Evil');
	});
});

describe('provider buttons with the real Better Auth', () => {
	it('starts GitHub: the state cookie is set and the visitor goes to GitHub with the callback on this site', async () => {
		const { auth } = await createTestAuth({
			socialProviders: { github: { clientId: 'gh-id', clientSecret: 'gh-secret' } }
		});
		const jar = new Map<string, string>();
		const event = {
			request: { formData: async () => formOf({ provider: 'github' }) },
			locals: { instance: { registrationMode: () => 'invite' }, auth },
			cookies: { set: (name: string, value: string) => void jar.set(name, value) },
			url: new URL('http://localhost/signin'),
			getClientAddress: () => '203.0.113.9'
		};

		const thrown = await createSignIn(createThrottle())
			.action(event as never)
			.catch((e: unknown) => e);

		expect(isRedirect(thrown)).toBe(true);
		const location = new URL((thrown as { location: string }).location);
		expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(location.searchParams.get('client_id')).toBe('gh-id');
		expect(location.searchParams.get('redirect_uri')).toBe(
			'http://localhost:3000/api/auth/callback/github'
		);
		expect(location.searchParams.get('state')).toBeTruthy();
		expect(jar.size).toBeGreaterThan(0);
	});
});

describe('a provider sign-in that completes gives its start back', () => {
	const origin = 'http://localhost:3000';

	/** A GitHub that answers from memory, as a different person each time `who` changes. */
	function github(who: () => number) {
		return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input instanceof Request ? input.url : input);
			const n = who();
			if (url === 'https://github.com/login/oauth/access_token') {
				return Response.json({
					access_token: 'gh-token',
					token_type: 'bearer',
					scope: 'read:user'
				});
			}
			if (url === 'https://api.github.com/user') {
				return Response.json({
					id: n,
					login: `octo${n}`,
					name: `Octo ${n}`,
					email: `o${n}@example.com`
				});
			}
			if (url === 'https://api.github.com/user/emails') {
				return Response.json([{ email: `o${n}@example.com`, primary: true, verified: true }]);
			}
			throw new Error('unexpected request');
		});
	}

	async function world() {
		const starts = createProviderStarts();
		const { db, auth } = await createTestAuth({
			origin,
			socialProviders: { github: { clientId: 'gh-id', clientSecret: 'gh-secret' } },
			providerStarts: starts
		});
		const signIn = createSignIn(createThrottle(), starts);
		let person = 0;
		github(() => person);
		/** The button: returns the state of the authorize URL and the cookies the browser would send back. */
		async function press(address = '203.0.113.9') {
			const jar = new Map<string, string>();
			const event = {
				request: { formData: async () => formOf({ provider: 'github' }) },
				locals: { instance: { registrationMode: () => 'open' }, auth },
				cookies: { set: (name: string, value: string) => void jar.set(name, value) },
				url: new URL(`${origin}/signin`),
				getClientAddress: () => address
			};
			try {
				await signIn.action(event as never);
			} catch (thrown) {
				if (!isRedirect(thrown)) throw thrown;
				const state = new URL(thrown.location).searchParams.get('state');
				const cookie = [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
				return { started: true as const, state, cookie };
			}
			return { started: false as const };
		}
		const callback = (state: string | null, cookie: string) =>
			auth.handler(
				new Request(`${origin}/api/auth/callback/github?code=c&state=${state}`, {
					headers: { cookie }
				})
			);
		return {
			db,
			press,
			callback,
			next: () => {
				person += 1;
			},
			starts
		};
	}

	it('lets 30 sign-ins from one address each complete with a new session', async () => {
		const { db, press, callback, next } = await world();

		for (let i = 0; i < 30; i++) {
			next();
			const start = await press();
			expect(start.started, `start ${i + 1}`).toBe(true);
			if (!start.started) return;
			const done = await callback(start.state, start.cookie);
			expect(done.headers.get('location'), `callback ${i + 1}`).toBe('/');
		}

		expect(await db.session.count()).toBe(30);
	});

	it('still refuses the 21st start when none completes a callback', async () => {
		const { press } = await world();

		const results = [];
		for (let i = 0; i < 21; i++) results.push((await press()).started);

		expect(results.slice(0, 20).every(Boolean)).toBe(true);
		expect(results[20]).toBe(false);
	});

	it('gives back one start per callback: replaying a completed callback refunds nothing more', async () => {
		const { press, callback, next, starts } = await world();
		next();
		const first = await press();
		if (!first.started) throw new Error('refused');
		await callback(first.state, first.cookie);
		expect(starts.size()).toBe(0);
		for (let i = 0; i < 19; i++) await press();

		await callback(first.state, first.cookie);

		// 19 outstanding starts and the refund was spent: the 20th is allowed, the 21st is refused.
		expect((await press()).started).toBe(true);
		expect((await press()).started).toBe(false);
	});

	it('does not give a start back when the callback does not sign anyone in', async () => {
		const { press, callback, starts } = await world();
		const start = await press();
		if (!start.started) throw new Error('refused');

		const refused = await callback(start.state, '');

		expect(refused.headers.get('location')).toContain('error=');
		expect(starts.size()).toBe(1);
	});
});
