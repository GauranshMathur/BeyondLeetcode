import { isRedirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from '$lib/server/identity/auth';
import { createMultiUserIdentity } from '$lib/server/identity/multi-user';
import { createThrottle } from '$lib/server/identity/throttle';
import { createFileTestDb } from '$lib/server/test-db';
import { createSignIn, landing } from './sign-in';

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

	it('keeps a page whose name merely starts with signin', () => {
		expect(landing('/signing-off')).toBe('/signing-off');
	});
});

describe('the page', () => {
	it('offers Create an account while the Registration Mode is open', () => {
		expect(harness({ registration: 'open' }).load()).toEqual({ open: true });
	});

	it('offers no sign-up link while the Registration Mode is invite-only', () => {
		expect(harness({ registration: 'invite' }).load()).toEqual({ open: false });
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
			expect(result).toMatchObject({ status: 400, data: { message: WRONG } });
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
		expect(Object.keys((result as { data: object }).data).sort()).toEqual(['email', 'message']);
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

		expect(result).toMatchObject({ status: 400, data: { message: WRONG } });
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

		expect(result).toMatchObject({ status: 500, data: { message: FAILED } });
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

		expect(result).toMatchObject({ status: 500, data: { message: FAILED } });
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

		expect(result).toMatchObject({ status: 500, data: { message: FAILED } });
		expect(signInEmail).not.toHaveBeenCalled();
		expect(JSON.stringify(spy.mock.calls)).not.toMatch(/SELECT|ada@example/);
	});

	it('is unavailable, not a crash, when the request has no Better Auth', async () => {
		const { post } = harness({ auth: undefined });

		expect(await post(ada)).toMatchObject({ status: 503, data: { message: FAILED } });
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

		expect(withRightPassword).toMatchObject({ status: 400, data: { message: WRONG } });
		expect(withWrongPassword).toMatchObject({ status: 400, data: { message: WRONG } });
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

	it('counts the attempt against the Account and address Better Auth would sign in, and the address alone for an unknown email', async () => {
		const throttle = createThrottle();
		const attempt = vi.spyOn(throttle, 'attempt');
		const { post } = harness({ throttle, address: '203.0.113.9' });

		await post(wrongPassword);
		await post({ email: 'nobody@example.com', password: 'x' });
		await post({ email: '', password: '' });

		expect(attempt.mock.calls.map(([input]) => input)).toEqual([
			{ address: '203.0.113.9', accountId: 'user-ada' },
			{ address: '203.0.113.9', accountId: null },
			{ address: '203.0.113.9', accountId: null }
		]);
	});

	it('counts before anything else: a flood of guesses at unknown emails is limited per address at 20', async () => {
		const { post, signInEmail } = harness();
		for (let i = 0; i < 20; i++) await post({ email: `nobody${i}@example.com`, password: 'x' });
		signInEmail.mockClear();

		const result = await post(ada);

		expect(result).toMatchObject({ status: 400, data: { message: WRONG } });
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

		expect(result).toMatchObject({ status: 400, data: { message: WRONG } });
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

		expect(await post(ada)).toMatchObject({ status: 400, data: { message: WRONG } });
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

		expect(result).toMatchObject({ status: 400, data: { message: WRONG } });
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
		const db = await createFileTestDb();
		const auth = createAuth({
			db,
			origin: 'http://localhost:3000',
			secret: 'test-secret-test-secret-test-secret-0123',
			admitSignUp: () => ({})
		});
		await auth.api.signUpEmail({ body: { name: 'Ada', email: 'ada@example.com', password } });
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

		expect(wrong).toMatchObject({ status: 400, data: { message: WRONG } });
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

		expect(result).toMatchObject({ status: 400, data: { message: WRONG } });
		expect(cookies.size).toBe(0);
	});

	it('maps the whole of Better Auth’s email check: a space-padded email is the one wrong message', async () => {
		const { post, cookies } = await real();

		const result = await post({ email: ' ada@example.com ', password });

		expect(result).toMatchObject({ status: 400, data: { message: WRONG } });
		expect(cookies.size).toBe(0);
	});
});
