import { describe, expect, it } from 'vitest';
import { createFileTestDb } from '../test-db.ts';
import { createAuth } from './auth.ts';
import { forwardSetCookies, handleAuthRequest } from './auth-handler.ts';

const origin = 'http://localhost:3000';
const secret = 'test-secret-test-secret-test-secret-0123';

async function setup() {
	const db = await createFileTestDb();
	return { db, auth: createAuth({ db, origin, secret }) };
}

const signIn = (headers: Record<string, string> = {}) =>
	new Request(`${origin}/api/auth/sign-in/email`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin, ...headers },
		body: JSON.stringify({ email: 'nobody@example.com', password: 'not the password' })
	});

describe('handleAuthRequest', () => {
	it('limits sign-in attempts per client address, whatever X-Forwarded-For claims', async () => {
		const { auth } = await setup();
		const statuses = [];
		for (let i = 0; i < 5; i++) {
			// A client rotating a forged header must still share one bucket.
			const res = await handleAuthRequest(
				auth,
				signIn({ 'x-forwarded-for': `203.0.113.${i + 1}` }),
				'192.0.2.10'
			);
			statuses.push(res.status);
		}

		expect(statuses.slice(0, 3)).not.toContain(429);
		expect(statuses.slice(3)).toEqual([429, 429]);
	});

	it('gives each client address its own bucket', async () => {
		const { auth } = await setup();
		for (let i = 0; i < 4; i++) await handleAuthRequest(auth, signIn(), '192.0.2.20');

		const other = await handleAuthRequest(auth, signIn(), '192.0.2.21');
		const same = await handleAuthRequest(auth, signIn(), '192.0.2.20');

		expect(other.status).not.toBe(429);
		expect(same.status).toBe(429);
	});

	it('gives two IPv6 clients in one /64 their own buckets', async () => {
		const { auth } = await setup();
		// One LAN client hammering sign-in must not lock out its neighbour.
		for (let i = 0; i < 4; i++) await handleAuthRequest(auth, signIn(), 'fd00:1:2:3::10');

		const neighbour = await handleAuthRequest(auth, signIn(), 'fd00:1:2:3::20');
		const same = await handleAuthRequest(auth, signIn(), 'fd00:1:2:3::10');
		// IPv4-mapped IPv6 is still the same client as its IPv4 form.
		for (let i = 0; i < 4; i++) await handleAuthRequest(auth, signIn(), '::ffff:192.0.2.77');
		const mapped = await handleAuthRequest(auth, signIn(), '192.0.2.77');

		expect(neighbour.status).not.toBe(429);
		expect(same.status).toBe(429);
		expect(mapped.status).toBe(429);
	});

	it('ignores a client-supplied copy of the private address header', async () => {
		const { auth } = await setup();
		for (let i = 0; i < 4; i++) {
			// Each attempt claims a fresh address in the header the limiter reads.
			await handleAuthRequest(
				auth,
				signIn({ 'x-beyondleetcode-client-ip': `198.51.100.${i + 1}` }),
				'192.0.2.30'
			);
		}

		const res = await handleAuthRequest(
			auth,
			signIn({ 'x-beyondleetcode-client-ip': '198.51.100.99' }),
			'192.0.2.30'
		);
		expect(res.status).toBe(429);
	});

	it('answers with headers the caller can still add to', async () => {
		const { auth } = await setup();

		const res = await handleAuthRequest(auth, signIn(), '192.0.2.40');

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
