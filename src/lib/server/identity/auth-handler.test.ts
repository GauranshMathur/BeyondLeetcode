import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from './auth.ts';
import { forwardSetCookies, handleAuthRequest } from './auth-handler.ts';
import { createTestAuth, TEST_ORIGIN } from './test-auth.ts';

const origin = TEST_ORIGIN;

async function setup() {
	const { db, auth } = await createTestAuth();
	return { db, auth };
}

// Only the provider callback is served over HTTP (the forms call `auth.api`, see auth.ts), so these tests get
// at the limiter through GET /callback/github, under Better Auth's default budget of 100 requests per 10
// seconds per address and path. The provider is not configured, so the callback answers the same every time
// and a 429 is the limiter alone.
const BUDGET = 100;
const limited = (headers: Record<string, string> = {}) =>
	new Request(`${origin}/api/auth/callback/github?code=fake-code&state=fake-state`, {
		headers
	});

describe('handleAuthRequest', () => {
	it('limits attempts per client address, whatever X-Forwarded-For claims', async () => {
		const { auth } = await setup();
		const statuses = [];
		for (let i = 0; i < BUDGET + 2; i++) {
			// A client rotating a forged header must still share one bucket.
			const res = await handleAuthRequest(
				auth,
				limited({ 'x-forwarded-for': `203.0.113.${i + 1}` }),
				'192.0.2.10'
			);
			statuses.push(res.status);
		}

		expect(statuses.slice(0, BUDGET)).not.toContain(429);
		expect(statuses.slice(BUDGET)).toEqual([429, 429]);
	});

	it('gives each client address its own bucket', async () => {
		const { auth } = await setup();
		for (let i = 0; i < BUDGET + 1; i++) await handleAuthRequest(auth, limited(), '192.0.2.20');

		const other = await handleAuthRequest(auth, limited(), '192.0.2.21');
		const same = await handleAuthRequest(auth, limited(), '192.0.2.20');

		expect(other.status).not.toBe(429);
		expect(same.status).toBe(429);
	});

	it('groups IPv6 clients by /64: rotating addresses inside one /64 does not escape the limit', async () => {
		const { auth } = await setup();
		for (let i = 1; i <= BUDGET + 1; i++) {
			await handleAuthRequest(auth, limited(), `fd00:aa:bb:cc::${i}`);
		}

		const sameSubnet = await handleAuthRequest(auth, limited(), 'fd00:aa:bb:cc:1:2:3:4');
		const otherSubnet = await handleAuthRequest(auth, limited(), 'fd00:aa:bb:dd::1');

		expect(sameSubnet.status).toBe(429);
		expect(otherSubnet.status).not.toBe(429);
	});

	it('treats an IPv4-mapped IPv6 address as its IPv4 client', async () => {
		const { auth } = await setup();
		for (let i = 0; i < BUDGET + 1; i++)
			await handleAuthRequest(auth, limited(), '::ffff:192.0.2.77');

		const mapped = await handleAuthRequest(auth, limited(), '192.0.2.77');

		expect(mapped.status).toBe(429);
	});

	it('keeps callers whose address cannot be told in one shared bucket', async () => {
		const { auth } = await setup();
		for (let i = 0; i < BUDGET + 1; i++) await handleAuthRequest(auth, limited(), '');

		const again = await handleAuthRequest(auth, limited(), '');
		const known = await handleAuthRequest(auth, limited(), '192.0.2.60');

		expect(again.status).toBe(429);
		expect(known.status).not.toBe(429);
	});

	describe('on the production key path (no test-mode address fallback)', () => {
		afterEach(() => vi.unstubAllEnvs());

		it('keeps callers whose address cannot be told in one shared bucket', async () => {
			vi.stubEnv('NODE_ENV', 'production');
			const { auth } = await setup();
			for (let i = 0; i < BUDGET + 1; i++) await handleAuthRequest(auth, limited(), '');

			const again = await handleAuthRequest(auth, limited(), '');
			const known = await handleAuthRequest(auth, limited(), '192.0.2.61');

			expect(again.status).toBe(429);
			expect(known.status).not.toBe(429);
		});
	});

	it('ignores a client-supplied copy of the private address header', async () => {
		const { auth } = await setup();
		for (let i = 0; i < BUDGET + 1; i++) {
			// Each attempt claims a fresh address in the header the limiter reads.
			await handleAuthRequest(
				auth,
				limited({ 'x-beyondleetcode-client-ip': `198.51.100.${i + 1}` }),
				'192.0.2.30'
			);
		}

		const res = await handleAuthRequest(
			auth,
			limited({ 'x-beyondleetcode-client-ip': '198.51.100.99' }),
			'192.0.2.30'
		);
		expect(res.status).toBe(429);
	});

	it('answers with headers the caller can still add to', async () => {
		const { auth } = await setup();

		const res = await handleAuthRequest(auth, limited(), '192.0.2.40');

		res.headers.set('X-Frame-Options', 'DENY');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
	});
});

describe('the served paths', () => {
	// Every endpoint the Better Auth instance has, read from the instance itself, so one that an upgrade adds
	// is in the table without anyone listing it.
	const endpoints = async () => {
		const { auth } = await setup();
		const paths = Object.values(auth.api as Record<string, { path?: string }>)
			.map((endpoint) => endpoint.path)
			.filter((path): path is string => typeof path === 'string');
		return { auth, paths };
	};
	const reached = () => {
		const handler = vi.fn(async () => new Response('reached'));
		return { auth: { handler } as unknown as Auth, handler };
	};
	const ask = (path: string, method = 'POST') =>
		new Request(`${origin}/api/auth${path}`, { method, headers: { origin } });

	it('lists endpoints to check, among them the ones this app turns off by name', async () => {
		const { paths } = await endpoints();

		expect(paths.length).toBeGreaterThan(30);
		expect(paths).toEqual(
			expect.arrayContaining([
				'/get-session',
				'/sign-in/email',
				'/admin/list-users',
				'/sign-out',
				'/sign-up/email',
				'/callback/:id'
			])
		);
	});

	it('answers 404 for every Better Auth path outside the allowlist, without reaching Better Auth', async () => {
		const { paths } = await endpoints();
		const outside = paths
			// A path with a parameter is asked with a value.
			.map((path) => path.replace(/:[A-Za-z]+/g, 'x'))
			.filter((path) => path !== '/callback/x');
		const { auth, handler } = reached();

		for (const path of outside) {
			for (const method of ['GET', 'POST']) {
				const res = await handleAuthRequest(auth, ask(path, method), '192.0.2.70');
				expect(res.status, `${method} ${path}`).toBe(404);
			}
		}

		expect(outside).toContain('/get-session');
		expect(outside).toContain('/sign-out');
		expect(outside).toContain('/sign-up/email');
		expect(handler).not.toHaveBeenCalled();
	});

	it('answers 404 for paths Better Auth does not have, and for lookalikes of the served ones', async () => {
		const { auth, handler } = reached();

		for (const path of [
			'/',
			'/unknown',
			'/sign-out/',
			'/Sign-Out',
			'/sign-out/extra',
			'/sign-up/email/',
			'//sign-out',
			'/%73ign-out',
			'/sign-up/email%2f',
			'/callback',
			'/callback/',
			'/callback/github/extra',
			'/callback/git%68ub',
			'/callback/a.b',
			'/callback/x%2F..%2Fget-session',
			'/callback/..%2Fget-session',
			'/delete-user/callback'
		]) {
			const res = await handleAuthRequest(auth, ask(path), '192.0.2.71');
			expect(res.status, path).toBe(404);
		}
		const outsideMount = await handleAuthRequest(
			auth,
			new Request(`${origin}/api/authx/sign-out`, { method: 'POST' }),
			'192.0.2.71'
		);

		expect(outsideMount.status).toBe(404);
		expect(handler).not.toHaveBeenCalled();
	});

	it('answers 404 for POST /api/auth/sign-out and POST /api/auth/sign-up/email, with or without a query string', async () => {
		const { auth, handler } = reached();

		for (const path of ['/sign-out', '/sign-out?x=1', '/sign-up/email', '/sign-up/email?x=1']) {
			const res = await handleAuthRequest(auth, ask(path), '192.0.2.73');
			expect(res.status, path).toBe(404);
		}

		expect(handler).not.toHaveBeenCalled();
	});

	it('answers 404 for POST /api/auth/sign-up/email through the real Better Auth too, with a sign-up admitted', async () => {
		const { auth, db } = await createTestAuth({ admit: () => ({}) });

		const res = await handleAuthRequest(
			auth,
			new Request(`${origin}/api/auth/sign-up/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin },
				body: JSON.stringify({
					name: 'Ada',
					email: 'ada@example.com',
					password: 'correct horse battery'
				})
			}),
			'192.0.2.75'
		);

		expect(res.status).toBe(404);
		expect(await db.user.count()).toBe(0);
	});

	it('decides on the path alone: a query string does not change it', async () => {
		const { auth, handler } = reached();

		const callback = await handleAuthRequest(
			auth,
			ask('/callback/github?code=x&state=y', 'GET'),
			'192.0.2.74'
		);
		const sneaky = await handleAuthRequest(
			auth,
			ask('/get-session?next=/callback/github', 'GET'),
			'192.0.2.74'
		);

		expect(await callback.text()).toBe('reached');
		expect(sneaky.status).toBe(404);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('passes the provider callback to Better Auth', async () => {
		const { auth, handler } = reached();

		for (const [method, path] of [
			['GET', '/callback/github'],
			['GET', '/callback/google'],
			['POST', '/callback/github']
		]) {
			const res = await handleAuthRequest(auth, ask(path, method), '192.0.2.72');
			expect(await res.text(), `${method} ${path}`).toBe('reached');
		}

		expect(handler).toHaveBeenCalledTimes(3);
	});
});

describe('forwardSetCookies', () => {
	const calls = () => {
		const set: [string, string, Record<string, unknown>][] = [];
		return {
			set,
			cookies: { set: (n: string, v: string, o: Record<string, unknown>) => set.push([n, v, o]) }
		};
	};

	it('sets each cookie with the attributes Better Auth chose, and not Secure on plain http', () => {
		const { set, cookies } = calls();

		forwardSetCookies(cookies, [
			'better-auth.session_token=abc.def%3D; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax'
		]);

		expect(set).toEqual([
			[
				'better-auth.session_token',
				'abc.def=',
				expect.objectContaining({
					maxAge: 604800,
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					secure: false
				})
			]
		]);
	});

	it('keeps Secure when Better Auth set it', () => {
		const { set, cookies } = calls();

		forwardSetCookies(cookies, ['__Secure-better-auth.session_token=x; Path=/; Secure; HttpOnly']);

		expect(set[0][2]).toMatchObject({ secure: true });
	});
});
