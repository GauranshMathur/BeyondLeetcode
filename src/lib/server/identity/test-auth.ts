import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db.ts';
import { createFileTestDb } from '../test-db.ts';
import { type AdmitSignUp, type CreateAuthOptions, createAuth } from './auth.ts';

/** Test-only: never import this from non-test code. */

/** Derived once per test process, so no secret literal sits in the source; no test depends on its value. */
export const TEST_SECRET = randomBytes(32).toString('base64url');
export const TEST_ORIGIN = 'http://localhost:3000';

const FAST_PREFIX = '$test$sha256$';
const fastHash = (password: string) =>
	`${FAST_PREFIX}${createHash('sha256').update(password.normalize('NFKC')).digest('hex')}`;

/** Intentionally fast, like Better Auth's own test instance: SHA-256 of the password's NFKC form. */
export const fastPasswordHasher = {
	hash: async (password: string) => fastHash(password),
	verify: async ({ hash, password }: { hash: string; password: string }) =>
		hash === fastHash(password)
};

export type TestAuthOptions = Omit<
	CreateAuthOptions,
	'db' | 'origin' | 'secret' | 'admitSignUp' | 'passwordHasher'
> & {
	/** Who may sign up; the default admits everyone. */
	admit?: AdmitSignUp;
	/** `'fast'` (the default) or Better Auth's production scrypt. */
	hasher?: 'fast' | 'production';
	/** The public origin; defaults to `TEST_ORIGIN`. */
	origin?: string;
};

/** A Better Auth instance on a fresh file database. */
export async function createTestAuth({
	admit,
	hasher = 'fast',
	origin = TEST_ORIGIN,
	...rest
}: TestAuthOptions = {}) {
	const db: Db = await createFileTestDb();
	const auth = createAuth({
		...rest,
		db,
		origin,
		secret: TEST_SECRET,
		admitSignUp: admit ?? (() => ({})),
		...(hasher === 'fast' ? { passwordHasher: fastPasswordHasher } : {})
	});

	/** Signs up an Account; `cookie` is the session's Set-Cookie pairs joined as one Cookie header. */
	async function signUp({
		name = 'Ada',
		email = 'ada@example.com',
		password = 'correct horse battery'
	}: {
		name?: string;
		email?: string;
		password?: string;
	} = {}) {
		const res = await auth.api.signUpEmail({
			body: { name, email, password },
			returnHeaders: true
		});
		const cookie = res.headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		return { id: res.response.user.id, email, cookie };
	}

	/** A Request on the instance's origin (`TEST_ORIGIN` unless overridden) carrying the cookie. */
	function requestOf(cookie: string, path = '/', init: RequestInit = {}) {
		const headers = new Headers(init.headers);
		headers.set('cookie', cookie);
		return new Request(new URL(path, origin), { ...init, headers });
	}

	return { auth, db, signUp, requestOf };
}
