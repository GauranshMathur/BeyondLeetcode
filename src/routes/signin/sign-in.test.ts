import { isRedirect } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	type AccountActions,
	createAccountActions,
	type Refusal,
	type RefusalCode
} from '#lib/server/identity/account-actions.js';
import { createMultiUserIdentity } from '#lib/server/identity/multi-user.js';
import { createTestAuth } from '#lib/server/identity/test-auth.js';
import { createProviderStarts } from '#lib/server/identity/throttle.js';
import { createSignIn, landing, providerNotice } from './sign-in';

afterEach(() => vi.restoreAllMocks());

const SESSION_COOKIE =
	'better-auth.session_token=abc.def%3D; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax';
const STATE_COOKIE = 'better-auth.state=abc.def; Max-Age=600; Path=/; HttpOnly; SameSite=Lax';
const AUTHORIZE = 'https://github.com/login/oauth/authorize?client_id=x&state=abc';
const ada = { email: 'ada@example.com', password: 'correct horse battery' };
const WRONG = 'Email or password is wrong.';
const FAILED = 'Signing in failed. Try again.';

type Form = Record<string, string>;

function formOf(values: Form) {
	const body = new FormData();
	for (const [key, value] of Object.entries(values)) body.set(key, value);
	return body;
}

const refusal = (refused: RefusalCode): Refusal => ({ refused });

/**
 * The request event the Sign in page reads. `locals.multiUser.accounts` is a stand-in whose answers a test
 * chooses (the actions have their own tests); `accounts: null` is a request that has no account actions.
 */
function harness(
	options: {
		accounts?: Partial<AccountActions> | null;
		registration?: 'open' | 'invite';
		identity?: unknown;
		address?: string | (() => string);
		next?: string | null;
	} = {}
) {
	const defaults = {
		providers: vi.fn(() => [] as { id: 'github' | 'google'; name: string }[]),
		signIn: vi.fn(async (_input: unknown) => ({ cookies: [SESSION_COOKIE] }) as unknown),
		startProvider: vi.fn(
			async (_input: unknown) => ({ cookies: [STATE_COOKIE], location: AUTHORIZE }) as unknown
		)
	};
	const accounts = { ...defaults, ...options.accounts } as typeof defaults;
	const signIn = createSignIn();
	const cookies = { set: vi.fn() };
	const setHeaders = vi.fn();
	const address = options.address ?? '203.0.113.7';
	const locals = {
		instance: { registrationMode: () => options.registration ?? 'open' },
		multiUser: options.accounts === null ? {} : { accounts },
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
	return { signIn, accounts, cookies, setHeaders, post, load };
}

function realAccounts(
	auth: Awaited<ReturnType<typeof createTestAuth>>['auth'],
	providerStarts = createProviderStarts()
) {
	return createAccountActions({
		auth,
		providerStarts,
		registrationOpen: () => true,
		inviteValid: async () => false
	});
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
		const locals = { instance: { registrationMode: () => mode }, multiUser: {} };
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
	it('signs in with the typed email, password and client address, forwards the session cookie and lands on the Map', async () => {
		const { post, accounts, cookies } = harness({ address: '203.0.113.9' });

		const result = await post(ada);

		expect(accounts.signIn).toHaveBeenCalledExactlyOnceWith({ ...ada, address: '203.0.113.9' });
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
		const { post, accounts } = harness();

		await post({ ...ada, rememberMe: 'false', callbackURL: 'https://evil.example', role: 'admin' });

		expect(Object.keys(accounts.signIn.mock.calls[0][0] as object).sort()).toEqual([
			'address',
			'email',
			'password'
		]);
	});

	it('hands the email on as typed: the action looks the Account up', async () => {
		const { post, accounts } = harness();

		await post({ email: ' Ada@Example.COM', password: ada.password });

		expect(accounts.signIn).toHaveBeenCalledWith(
			expect.objectContaining({ email: ' Ada@Example.COM' })
		);
	});

	it('reads a blank or missing field as an empty string', async () => {
		const { post, accounts } = harness();

		await post({ password: ada.password });

		expect(accounts.signIn).toHaveBeenCalledWith(expect.objectContaining({ email: '' }));
	});

	it('does nothing for someone who is already signed in', async () => {
		const { post, accounts } = harness({ identity: { learnerId: 'l1' }, next: '/topics/stacks' });

		expect(await post(ada)).toMatchObject({ status: 303, location: '/topics/stacks' });
		expect(accounts.signIn).not.toHaveBeenCalled();
	});

	it('hands on the empty address, the one shared bucket, when the client address cannot be read', async () => {
		const { post, accounts } = harness({
			address: () => {
				throw new Error('no address');
			}
		});

		await post(ada);

		const { address } = accounts.signIn.mock.calls[0][0] as { address: string };
		expect(address).toBe('');
	});
});

describe('one message for everything that is wrong with a sign-in', () => {
	const refusedBy = (code: RefusalCode) =>
		harness({ accounts: { signIn: async () => refusal(code) } });

	it('says the wrong-sign-in text, marked as such, with the typed email and never the password', async () => {
		const result = await refusedBy('WRONG_SIGN_IN').post({
			email: 'ada@example.com',
			password: 'hunter2-hunter2'
		});

		expect(result).toMatchObject({
			status: 400,
			data: { email: 'ada@example.com', message: WRONG, wrong: true }
		});
		expect(JSON.stringify(result)).not.toContain('hunter2');
		expect(Object.keys((result as { data: object }).data).sort()).toEqual([
			'email',
			'message',
			'wrong'
		]);
	});

	it('sets no Retry-After and no cookie for a wrong sign-in', async () => {
		const h = refusedBy('WRONG_SIGN_IN');

		await h.post(ada);

		expect(h.setHeaders).not.toHaveBeenCalled();
		expect(h.cookies.set).not.toHaveBeenCalled();
	});

	it.each([['SIGN_IN_FAILED'], ['SIGN_UP_FAILED'], ['TOO_MANY_ATTEMPTS']] as const)(
		'hides %s behind the fixed failure text, not marked as wrong',
		async (code) => {
			const h = refusedBy(code);

			const result = await h.post(ada);

			expect(result).toMatchObject({ status: 500, data: { message: FAILED, wrong: false } });
			expect(JSON.stringify(result)).not.toContain(code);
			expect(h.cookies.set).not.toHaveBeenCalled();
		}
	);

	it('is unavailable, not a crash, when the request has no account actions', async () => {
		const { post } = harness({ accounts: null });

		expect(await post(ada)).toMatchObject({ status: 503, data: { message: FAILED, wrong: false } });
	});
});

describe('with the real Better Auth', () => {
	const password = 'correct horse battery';

	async function real() {
		const { db, auth, signUp } = await createTestAuth();
		await signUp({ password });
		const signIn = createSignIn();
		const accounts = realAccounts(auth);
		const cookies = new Map<string, string>();
		const jar = {
			set: (name: string, value: string) => void cookies.set(name, value)
		};
		const post = async (values: Form, next = '/') => {
			const event = {
				request: { formData: async () => formOf(values) },
				locals: { instance: { registrationMode: () => 'open' }, multiUser: { accounts } },
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

	it('hides a failure behind a fixed message and logs only the label and the kind: no email, password, message or cookie', async () => {
		const { post, cookies, auth } = await real();
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = Object.assign(
			new Error(
				`SQLITE_BUSY at /data/app.db: SELECT FROM "User" ${'ada@example.com'} ${password} abc.def`
			),
			{ code: 'SQLITE_BUSY' }
		);
		const signInEmail = vi.spyOn(auth.api, 'signInEmail').mockRejectedValueOnce(failure);

		const result = await post({ email: 'ada@example.com', password });

		expect(signInEmail).toHaveBeenCalledOnce();
		expect(result).toMatchObject({ status: 500, data: { message: FAILED, wrong: false } });
		expect(JSON.stringify(result)).not.toMatch(/SQLITE|app\.db|SELECT|correct horse/);
		expect(log).toHaveBeenCalledOnce();
		expect(log.mock.calls).toEqual([['Sign in: signing in failed: Error']]);
		expect(JSON.stringify(log.mock.calls)).not.toMatch(
			/app\.db|SELECT|ada@example|correct horse|abc\.def|Error: /
		);
		expect(cookies.size).toBe(0);
	});

	it('does not log the password, the email or the cookies, for a right or a wrong sign-in', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
		const { post } = await real();

		await post({ email: 'ada@example.com', password });
		await post({ email: 'ada@example.com', password: 'wrong wrong wrong' });

		expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toMatch(
			/correct horse|wrong wrong|abc\.def|ada@example/
		);
	});

	it('logs only the kind when the Account lookup fails, and signs nobody in', async () => {
		const { post, cookies, auth } = await real();
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { internalAdapter } = await auth.$context;
		vi.spyOn(internalAdapter, 'findUserByEmail').mockRejectedValueOnce(
			new Error('SELECT * FROM "User" WHERE email = ada@example.com')
		);

		const result = await post({ email: 'ada@example.com', password });

		expect(result).toMatchObject({ status: 500, data: { message: FAILED, wrong: false } });
		expect(JSON.stringify(log.mock.calls)).not.toMatch(/SELECT|ada@example/);
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
	it('lists the providers the actions offer, and none without account actions', () => {
		const providers = [
			{ id: 'github', name: 'GitHub' },
			{ id: 'google', name: 'Google' }
		];
		expect(
			(
				harness({ accounts: { providers: () => providers as never } }).load() as {
					providers: unknown[];
				}
			).providers
		).toEqual(providers);
		expect((harness().load() as { providers: unknown[] }).providers).toEqual([]);
		expect((harness({ accounts: null }).load() as { providers: unknown[] }).providers).toEqual([]);
	});

	it('starts the provider with its id, the page to return to and the client address, and sends the visitor there', async () => {
		const h = harness({ address: '203.0.113.9' });

		const result = (await h.post({ provider: 'github' })) as { status: number; location: string };

		expect(result.status).toBe(303);
		expect(result.location).toBe(AUTHORIZE);
		expect(h.accounts.startProvider).toHaveBeenCalledExactlyOnceWith({
			provider: 'github',
			next: '/',
			address: '203.0.113.9'
		});
		expect(h.cookies.set).toHaveBeenCalledWith(
			'better-auth.state',
			'abc.def',
			expect.objectContaining({ path: '/', httpOnly: true })
		);
		expect(h.accounts.signIn).not.toHaveBeenCalled();
	});

	it('returns to the page the visitor asked for, and never to another site', async () => {
		const own = harness({ next: '/topics/stacks' });
		await own.post({ provider: 'github' });
		expect(own.accounts.startProvider).toHaveBeenCalledWith(
			expect.objectContaining({ next: '/topics/stacks' })
		);

		const evil = harness({ next: '//evil.example' });
		await evil.post({ provider: 'github' });
		expect(evil.accounts.startProvider).toHaveBeenCalledWith(
			expect.objectContaining({ next: '/' })
		);
	});

	it('does not take what the form says about redirects, tokens or sign-up', async () => {
		const h = harness();

		await h.post({
			provider: 'github',
			callbackURL: 'https://evil.example',
			idToken: 'x',
			requestSignUp: 'true'
		});

		expect(Object.keys(h.accounts.startProvider.mock.calls[0][0] as object).sort()).toEqual([
			'address',
			'next',
			'provider'
		]);
	});

	it('answers a start refused up front with 400 and a failure with 500, both with the failure text', async () => {
		for (const [code, status] of [
			['PROVIDER_REFUSED', 400],
			['SIGN_IN_FAILED', 500]
		] as const) {
			const h = harness({ accounts: { startProvider: async () => refusal(code) } });

			const result = await h.post({ provider: 'github' });

			expect(result, code).toMatchObject({
				status,
				data: { email: '', message: FAILED, wrong: false }
			});
			expect(h.cookies.set).not.toHaveBeenCalled();
		}
	});

	it('does nothing for someone who is already signed in', async () => {
		const h = harness({ identity: { learnerId: 'l' } });
		const result = (await h.post({ provider: 'github' })) as { status: number; location: string };
		expect(result.status).toBe(303);
		expect(result.location).toBe('/');
		expect(h.accounts.startProvider).not.toHaveBeenCalled();
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
			locals: { instance: { registrationMode: () => 'invite' }, multiUser: {} },
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
			locals: {
				instance: { registrationMode: () => 'invite' },
				multiUser: { accounts: realAccounts(auth) }
			},
			cookies: { set: (name: string, value: string) => void jar.set(name, value) },
			url: new URL('http://localhost/signin'),
			getClientAddress: () => '203.0.113.9'
		};

		const thrown = await createSignIn()
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
		const signIn = createSignIn();
		const accounts = realAccounts(auth, starts);
		let person = 0;
		github(() => person);
		/** The button: returns the state of the authorize URL and the cookies the browser would send back. */
		async function press(address = '203.0.113.9') {
			const jar = new Map<string, string>();
			const event = {
				request: { formData: async () => formOf({ provider: 'github' }) },
				locals: { instance: { registrationMode: () => 'open' }, multiUser: { accounts } },
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
