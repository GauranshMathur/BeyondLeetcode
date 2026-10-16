import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import type { App } from './app.ts';
import { createHandle } from './handle.ts';
import { createAuth } from './identity/auth.ts';
import { createLocalIdentity } from './identity/index.ts';
import { createMultiUserIdentity } from './identity/multi-user.ts';
import { createRegistration } from './identity/registration.ts';
import { createFirstAdmin } from './identity/setup.ts';
import { createInstance } from './instance.ts';
import { createFileTestDb, createTestDb } from './test-db.ts';

async function setup(options: { local?: boolean } = {}) {
	const db = await createTestDb();
	const instance = await createInstance(db);
	const identity = await createLocalIdentity(db);
	if (options.local) {
		await instance.chooseLocal();
		await identity.ensureLocalLearner();
	}
	const core = { forLearner: (learnerId: string) => ({ learnerId }) } as unknown as App['core'];
	const setupPort = { multiUser: { kind: 'open' }, createFirstAdmin: vi.fn() } as App['setup'];
	return {
		db,
		handle: createHandle({ instance, identity, core, multiUser: null, setup: setupPort })
	};
}

function request(path: string, routeId: string | null, method = 'GET', headers = new Headers()) {
	const url = new URL(path, 'http://localhost');
	const locals: Record<string, unknown> = {};
	const event = {
		url,
		route: { id: routeId },
		request: { method, headers },
		cookies: { get: () => undefined, set: vi.fn() },
		locals
	} as unknown as RequestEvent;
	const resolve = vi.fn<ResolveFn>(async () => new Response('page'));
	return { event, locals, resolve };
}

type ResolveFn = (event: RequestEvent, opts?: ResolveOptions) => Promise<Response>;

const call = ({ event, resolve }: ReturnType<typeof request>) => ({ event, resolve });

const framing = {
	'content-security-policy': "frame-ancestors 'none'",
	'x-frame-options': 'DENY'
};

it('on a fresh Instance every page redirects to Setup, with the anti-framing headers', async () => {
	const { handle, db } = await setup();

	for (const [path, routeId] of [
		['/', '/'],
		['/topics/stacks', '/topics/[topicId]'],
		['/problems/p', '/problems/[problemId]'],
		['/settings?reset=confirm', '/settings'],
		['/no/such/page', null]
	] as const) {
		const { event, resolve } = request(path, routeId);
		const response = await handle({ event, resolve });
		expect(response.status, path).toBe(303);
		expect(response.headers.get('location'), path).toBe('/setup');
		expect(Object.fromEntries(response.headers), path).toMatchObject(framing);
		expect(resolve, path).not.toHaveBeenCalled();
	}
	// Nobody was resolved, so no Local Learner was made before Setup.
	expect(await db.learner.count()).toBe(0);
});

it('a state-changing request on a fresh Instance is redirected too, never run', async () => {
	const { handle } = await setup();
	const { event, resolve } = request('/problems/p?/submit', '/problems/[problemId]', 'POST');

	const response = await handle({ event, resolve });

	expect(response.status).toBe(303);
	expect(resolve).not.toHaveBeenCalled();
});

it('Setup itself renders on a fresh Instance, for nobody', async () => {
	const { handle } = await setup();
	const { event, locals, resolve } = request('/setup', '/setup');

	const response = await handle({ event, resolve });

	expect(await response.text()).toBe('page');
	expect(Object.fromEntries(response.headers)).toMatchObject(framing);
	expect(locals.identity).toBeUndefined();
	expect(locals.learning).toBeUndefined();
});

it('a remote call is refused with 404 in every mode, whatever pathname its headers claim', async () => {
	const fresh = await setup();
	const local = await setup({ local: true });
	for (const { handle } of [fresh, local]) {
		for (const [path, routeId] of [
			['/_app/remote/abc/fn', null],
			['/_app/x', null],
			['/setup', '/setup'],
			['/', '/']
		] as const) {
			const { event, resolve } = request(path, routeId, 'POST');
			(event as { isRemoteRequest: boolean }).isRemoteRequest = true;
			const response = await handle({ event, resolve });
			expect(response.status, path).toBe(404);
			expect(Object.fromEntries(response.headers), path).toMatchObject(framing);
			expect(resolve, path).not.toHaveBeenCalled();
		}
	}
});

it('the gate refusals are never cached', async () => {
	const fresh = await setup();
	const local = await setup({ local: true });

	const redirect = await fresh.handle(call(request('/', '/')));
	const notFound = await local.handle(call(request('/signin', '/signin')));

	expect(redirect.headers.get('cache-control')).toBe('no-store');
	expect(notFound.headers.get('cache-control')).toBe('no-store');
});

it('a Local Instance resolves the Local Learner and renders the page', async () => {
	const { handle } = await setup({ local: true });
	const { event, locals, resolve } = request('/', '/');

	const response = await handle({ event, resolve });

	expect(response.status).toBe(200);
	expect(Object.fromEntries(response.headers)).toMatchObject(framing);
	expect(locals.identity).toEqual({ learnerId: 'local', displayName: 'Local', role: 'admin' });
	expect(locals.learning).toEqual({ learnerId: 'local' });
});

it('a Local Instance sends Setup back to the Map', async () => {
	const { handle } = await setup({ local: true });
	const { event, resolve } = request('/setup', '/setup');

	const response = await handle({ event, resolve });

	expect(response.status).toBe(303);
	expect(response.headers.get('location')).toBe('/');
	expect(resolve).not.toHaveBeenCalled();
});

it('a refusal from the gate (Multi-user only pages in Local Mode) is a 404 with the headers', async () => {
	const { handle } = await setup({ local: true });
	const { event, resolve } = request('/signin', '/signin');

	const response = await handle({ event, resolve });

	expect(response.status).toBe(404);
	expect(Object.fromEntries(response.headers)).toMatchObject(framing);
	expect(resolve).not.toHaveBeenCalled();
});

it('a Learner who chose a theme gets it on <html> in the render', async () => {
	const { handle } = await setup({ local: true });
	const { event, resolve } = request('/', '/');
	event.cookies = { get: (name: string) => (name === 'theme' ? 'dark' : undefined) } as never;
	let html = '';
	resolve.mockImplementation(async (_event, opts) => {
		html = opts?.transformPageChunk?.({ html: '<html lang="en">', done: true }) as string;
		return new Response(html);
	});

	await handle({ event, resolve });

	expect(html).toBe('<html lang="en" data-theme="dark">');
});

describe('Multi-user Mode', () => {
	async function multiSetup(options: { testLearnerCookie?: boolean } = {}) {
		const db = await createFileTestDb();
		const instance = await createInstance(db);
		const auth = createAuth({
			db,
			origin: 'http://localhost:3000',
			secret: 'test-secret-test-secret-test-secret-0123',
			admitSignUp: createRegistration({ instance })
		});
		const { headers } = await createFirstAdmin(
			{ instance, auth, db },
			{ name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' }
		);
		const cookie = headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		const identity = await createLocalIdentity(db, options);
		const core = { forLearner: (learnerId: string) => ({ learnerId }) } as unknown as App['core'];
		const multiUser = { auth, identity: createMultiUserIdentity(auth) };
		const setupPort = { multiUser: { kind: 'open' }, createFirstAdmin: vi.fn() } as App['setup'];
		return {
			db,
			auth,
			cookie,
			handle: createHandle({ instance, identity, core, multiUser, setup: setupPort }),
			asking: (path: string, routeId: string | null, cookieHeader = cookie) =>
				request(path, routeId, 'GET', new Headers(cookieHeader ? { cookie: cookieHeader } : {}))
		};
	}

	it('resolves the session cookie to its Account and binds the Learning core to its Learner', async () => {
		const { handle, asking } = await multiSetup();
		const { event, locals, resolve } = asking('/', '/');

		const response = await handle({ event, resolve });

		expect(response.status).toBe(200);
		expect(Object.fromEntries(response.headers)).toMatchObject(framing);
		expect(locals.identity).toEqual({
			learnerId: 'local',
			displayName: 'Ada',
			role: 'admin'
		});
		expect(locals.learning).toEqual({ learnerId: 'local' });
	});

	it('sends a signed-out visitor from any page to Sign in, remembering where they were going', async () => {
		const { handle, asking } = await multiSetup();

		for (const [path, routeId] of [
			['/', '/'],
			['/topics/stacks?x=1', '/topics/[topicId]'],
			['/settings', '/settings']
		] as const) {
			const { event, resolve } = asking(path, routeId, '');
			const response = await handle({ event, resolve });
			expect(response.status, path).toBe(303);
			expect(response.headers.get('location'), path).toBe(
				`/signin?next=${encodeURIComponent(path)}`
			);
			expect(Object.fromEntries(response.headers), path).toMatchObject(framing);
			expect(resolve, path).not.toHaveBeenCalled();
		}
	});

	it('lets the auth route through to a signed-out visitor, with the Better Auth instance on locals', async () => {
		const { handle, asking, auth } = await multiSetup();
		const { event, locals, resolve } = asking('/api/auth/get-session', '/api/auth/[...all]', '');

		const response = await handle({ event, resolve });

		expect(response.status).toBe(200);
		expect(Object.fromEntries(response.headers)).toMatchObject(framing);
		expect(locals.auth).toBe(auth);
		expect(locals.identity).toBeUndefined();
	});

	it('still refuses a remote call that claims the auth path', async () => {
		const { handle, asking } = await multiSetup();
		const { event, resolve } = asking('/api/auth/get-session', '/api/auth/[...all]', '');
		(event as { isRemoteRequest: boolean }).isRemoteRequest = true;

		const response = await handle({ event, resolve });

		expect(response.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('is not fooled by the test Learner cookie: with the switch on it is still nobody', async () => {
		const { handle, asking } = await multiSetup({ testLearnerCookie: true });
		const { event, locals, resolve } = asking('/', '/', '');
		event.cookies = {
			get: (name: string) => (name === 'test_learner' ? 'someone' : undefined),
			set: vi.fn()
		} as never;

		const response = await handle({ event, resolve });

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toMatch(/^\/signin/);
		expect(locals.identity).toBeUndefined();
		expect(locals.learning).toBeUndefined();
		expect(resolve).not.toHaveBeenCalled();
	});

	it('sends the extended session cookie with the response of an active session, redirects included', async () => {
		const { handle, asking, db } = await multiSetup();
		const day = 24 * 60 * 60 * 1000;
		await db.session.updateMany({ data: { expiresAt: new Date(Date.now() + 5 * day) } });
		await db.user.updateMany({ data: { mustChangePassword: true } });

		const page = asking('/account/password', '/account/password');
		const rendered = await handle({ event: page.event, resolve: page.resolve });
		await db.session.updateMany({ data: { expiresAt: new Date(Date.now() + 5 * day) } });
		const home = asking('/', '/');
		const redirected = await handle({ event: home.event, resolve: home.resolve });

		for (const response of [rendered, redirected]) {
			expect(response.headers.getSetCookie()).toEqual([
				expect.stringMatching(/^better-auth\.session_token=.*HttpOnly/i)
			]);
		}
		expect(redirected.status).toBe(303);
	});

	describe('when the session is due for a refresh and the response has cookies of its own', () => {
		const DAY = 24 * 60 * 60 * 1000;
		const session = 'better-auth.session_token';

		async function due(own: string[]) {
			const { handle, asking, db } = await multiSetup();
			await db.session.updateMany({ data: { expiresAt: new Date(Date.now() + 5 * DAY) } });
			const { event, resolve } = asking('/', '/');
			resolve.mockImplementation(async () => {
				const response = new Response('page');
				for (const cookie of own) response.headers.append('set-cookie', cookie);
				return response;
			});
			return (await handle({ event, resolve })).headers.getSetCookie();
		}

		it("keeps the response's new session cookie (sign-in as another user, change password), not the refreshed one", async () => {
			const cookies = await due([`${session}=NEWTOKEN.sig; Path=/; HttpOnly`]);

			expect(cookies).toEqual([`${session}=NEWTOKEN.sig; Path=/; HttpOnly`]);
		});

		it("keeps the response's clearing cookie (sign-out), not the refreshed one", async () => {
			const cookies = await due([`${session}=; Max-Age=0; Path=/; HttpOnly`]);

			expect(cookies).toEqual([`${session}=; Max-Age=0; Path=/; HttpOnly`]);
		});

		it('adds the refreshed cookie next to cookies of other names', async () => {
			const cookies = await due(['theme=dark; Path=/']);

			expect(cookies).toHaveLength(2);
			expect(cookies[0]).toBe('theme=dark; Path=/');
			expect(cookies[1]).toMatch(new RegExp(`^${session.replace('.', '\\.')}=.*HttpOnly`, 'i'));
		});

		it('adds the refreshed cookie when the response sets none', async () => {
			const cookies = await due([]);

			expect(cookies).toEqual([expect.stringMatching(/^better-auth\.session_token=.*HttpOnly/i)]);
		});

		it('matches whole names: a cookie that merely starts with the same letters does not hide it', async () => {
			const cookies = await due([`${session}_other=1; Path=/`]);

			expect(cookies).toHaveLength(2);
		});
	});

	it('sends no cookie while the session is fresh', async () => {
		const { handle, asking } = await multiSetup();
		const { event, resolve } = asking('/', '/');

		const response = await handle({ event, resolve });

		expect(response.headers.getSetCookie()).toEqual([]);
	});

	it('sends a user who must change their password to that page', async () => {
		const { handle, asking, db } = await multiSetup();
		await db.user.updateMany({ data: { mustChangePassword: true } });
		const { event, resolve } = asking('/', '/');

		const response = await handle({ event, resolve });

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/account/password');
	});

	it('sends Setup back to the Map', async () => {
		const { handle, asking } = await multiSetup();
		const { event, resolve } = asking('/setup', '/setup', '');

		const response = await handle({ event, resolve });

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/');
	});

	it('treats a path with no route as a private page: a signed-out visitor is sent to Sign in, not shown the 404', async () => {
		const { handle, asking } = await multiSetup();
		const { event, resolve } = asking('/no/such/page?x=1', null, '');

		const response = await handle({ event, resolve });

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe(
			`/signin?next=${encodeURIComponent('/no/such/page?x=1')}`
		);
		expect(Object.fromEntries(response.headers)).toMatchObject(framing);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('shows a signed-in user the 404 page for a path with no route, with the headers', async () => {
		const { handle, asking } = await multiSetup();
		const { event, resolve } = asking('/no/such/page', null);

		const response = await handle({ event, resolve });

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
		expect(Object.fromEntries(response.headers)).toMatchObject(framing);
	});

	it('sends a user who must change their password from a path with no route to that page', async () => {
		const { handle, asking, db } = await multiSetup();
		await db.user.updateMany({ data: { mustChangePassword: true } });
		const { event, resolve } = asking('/no/such/page', null);

		const response = await handle({ event, resolve });

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/account/password');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('still lets a user who must change their password sign out, from the nav and from Settings', async () => {
		const { handle, db, cookie } = await multiSetup();
		await db.user.updateMany({ data: { mustChangePassword: true } });
		for (const [path, routeId] of [
			['/settings?/signout', '/settings'],
			['/api/auth/sign-out', '/api/auth/[...all]']
		] as const) {
			const { event, resolve } = request(path, routeId, 'POST', new Headers({ cookie }));

			const response = await handle({ event, resolve });

			expect(response.status, path).toBe(200);
			expect(resolve, path).toHaveBeenCalledOnce();
		}
		// Any other action of that page is still held back.
		const reset = request('/settings?/reset', '/settings', 'POST', new Headers({ cookie }));
		const held = await handle({ event: reset.event, resolve: reset.resolve });
		expect(held.status).toBe(303);
		expect(held.headers.get('location')).toBe('/account/password');
	});

	it('does not set the refreshed session cookie over the one a sign-out clears', async () => {
		const { handle, db, cookie } = await multiSetup();
		await db.session.updateMany({
			data: { expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) }
		});
		const { event, resolve } = request(
			'/settings?/signout',
			'/settings',
			'POST',
			new Headers({ cookie })
		);
		resolve.mockImplementation(async () => {
			const response = new Response(null, { status: 303, headers: { location: '/signin' } });
			response.headers.append(
				'set-cookie',
				'better-auth.session_token=; Max-Age=0; Path=/; HttpOnly'
			);
			return response;
		});

		const response = await handle({ event, resolve });

		expect(response.headers.getSetCookie()).toEqual([
			'better-auth.session_token=; Max-Age=0; Path=/; HttpOnly'
		]);
	});

	it('fails closed when a multi Instance has no Better Auth', async () => {
		const db = await createTestDb();
		const instance = await createInstance(db);
		await instance.chooseMulti();
		const identity = await createLocalIdentity(db, { testLearnerCookie: true });
		const handle = createHandle({
			instance,
			identity,
			core: {} as App['core'],
			multiUser: null,
			setup: {} as App['setup']
		});
		const { event, resolve } = request('/', '/');

		const response = await handle({ event, resolve });

		expect(response.status).toBe(503);
		expect(Object.fromEntries(response.headers)).toMatchObject(framing);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('does not leak the adapter-only fields into locals.identity', async () => {
		const { handle, asking } = await multiSetup();
		const { event, locals, resolve } = asking('/', '/');

		await handle({ event, resolve });

		expect(Object.keys(locals.identity as object).sort()).toEqual([
			'displayName',
			'learnerId',
			'role'
		]);
	});
});
