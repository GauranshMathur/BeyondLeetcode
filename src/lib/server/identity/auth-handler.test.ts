import { describe, expect, it } from 'vitest';
import { forwardSetCookies, handleAuthRequest } from './auth-handler.ts';
import { createTestAuth, TEST_ORIGIN } from './test-auth.ts';

const origin = TEST_ORIGIN;

async function setup() {
	// No sign-up is admitted: the limiter tests below depend on the 403.
	const { db, auth } = await createTestAuth({ admit: () => null });
	return { db, auth };
}

// Password sign-in and change-password are not served over HTTP (the forms are the one way, see auth.ts), so
// these tests post to /sign-up/email: it stays served, and `createAuth` gives it 20 requests per 10 minutes
// per address. With no sign-up admitted it answers 403 to everyone, so a 429 is the limiter alone.
const BUDGET = 20;
const limited = (headers: Record<string, string> = {}) =>
	new Request(`${origin}/api/auth/sign-up/email`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin, ...headers },
		body: JSON.stringify({
			name: 'Ada',
			email: 'ada@example.com',
			password: 'correct horse battery'
		})
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

	it('gives a direct POST to /sign-up/email the form budget: 20 per 10 minutes per address', async () => {
		const { auth } = await setup();
		const signUp = () =>
			new Request(`${origin}/api/auth/sign-up/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin },
				body: JSON.stringify({
					name: 'Ada',
					email: 'ada@example.com',
					password: 'correct horse battery'
				})
			});

		const statuses = [];
		for (let i = 0; i < 21; i++) {
			statuses.push((await handleAuthRequest(auth, signUp(), '192.0.2.50')).status);
		}
		const other = await handleAuthRequest(auth, signUp(), '192.0.2.51');

		// Sign-up is closed in this setup (403), so the first twenty are answered, not limited.
		expect(statuses.slice(0, 20)).not.toContain(429);
		expect(statuses[20]).toBe(429);
		expect(other.status).not.toBe(429);
	});

	it('answers with headers the caller can still add to', async () => {
		const { auth } = await setup();

		const res = await handleAuthRequest(auth, limited(), '192.0.2.40');

		res.headers.set('X-Frame-Options', 'DENY');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
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
