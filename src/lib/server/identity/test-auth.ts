import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { App } from '../app.ts';
import type { Db } from '../db.ts';
import { createHandle } from '../handle.ts';
import { createInstance } from '../instance.ts';
import { createFileTestDb } from '../test-db.ts';
import { type AdmitSignUp, type CreateAuthOptions, createAuth } from './auth.ts';
import { createIdentity, createLocalIdentity } from './index.ts';
import { createMultiUserInstance, type MultiUserInstanceOptions } from './multi-user-instance.ts';
import { createFirstAdmin } from './setup.ts';

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

const cookieOf = (headers: Headers) =>
	headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');

export type TestInstanceOptions = {
	/** Wraps the production admission rule; omitted, the production rule decides. */
	admit?: MultiUserInstanceOptions['admit'];
	/** `'fast'` (the default) or Better Auth's production scrypt. */
	hasher?: 'fast' | 'production';
	/** The public origin; defaults to `TEST_ORIGIN`. */
	origin?: string;
	/** The OAuth provider variables, as the environment gives them. */
	providerEnv?: MultiUserInstanceOptions['providerEnv'];
	/** Turns on the e2e Learner cookie of the Local adapter. */
	testLearnerCookie?: boolean;
};

/**
 * The server's Multi-user wiring (`createMultiUserInstance`) on a fresh file database, with the fast
 * hasher: what a test gets when it means the production assembly. The Instance starts not set up; the
 * helpers choose its mode and make Accounts of each kind with their sessions.
 */
export async function createTestInstance({
	admit,
	hasher = 'fast',
	origin = TEST_ORIGIN,
	providerEnv = {},
	testLearnerCookie
}: TestInstanceOptions = {}) {
	const db: Db = await createFileTestDb();
	const instance = await createInstance(db);
	// Held open only while a helper makes a Learner's Account, whatever the Registration Mode says.
	let forcing = false;
	const built = await createMultiUserInstance({
		db,
		instance,
		secret: TEST_SECRET,
		origin,
		providerEnv,
		...(hasher === 'fast' ? { passwordHasher: fastPasswordHasher } : {}),
		admit: (production) => {
			const rule = admit ? admit(production) : production;
			return (attempt) => (forcing ? {} : rule(attempt));
		}
	});
	const { multiUser, resolver, auth } = built;
	const local = await createLocalIdentity(db, { testLearnerCookie });
	const setup: App['setup'] = {
		multiUser: { kind: 'open' },
		createFirstAdmin: (input) => createFirstAdmin({ instance, auth, db }, input)
	};
	// The Learning core is not Identity's: the page tests only need to see which Learner it was bound to.
	const core = { forLearner: (learnerId: string) => ({ learnerId }) } as unknown as App['core'];
	const app = {
		core,
		identity: createIdentity({ instance, local, multi: resolver }),
		instance,
		multiUser,
		setup
	};

	/** Chooses Multi-user by making the first admin; returns the session's Cookie header. */
	async function admin({
		name = 'Ada',
		email = 'ada@example.com',
		password = 'correct horse battery'
	}: {
		name?: string;
		email?: string;
		password?: string;
	} = {}) {
		const { headers } = await setup.createFirstAdmin({ name, email, password });
		return { email, cookie: cookieOf(headers) };
	}

	/** A learner with a password Account, whatever the Registration Mode is. */
	async function learner({
		name = 'Lin',
		email = 'lin@example.com',
		password = 'correct horse battery'
	}: {
		name?: string;
		email?: string;
		password?: string;
	} = {}) {
		forcing = true;
		try {
			const res = await auth.api.signUpEmail({
				body: { name, email, password },
				returnHeaders: true
			});
			return { id: res.response.user.id, email, cookie: cookieOf(res.headers) };
		} finally {
			forcing = false;
		}
	}

	/** An Account that signs in only with GitHub: no password Account, and the session a callback makes. */
	async function githubOnly({ name = 'Oz', email = 'oz@example.com' } = {}) {
		const id = `gh-${randomBytes(4).toString('hex')}`;
		await db.learner.create({ data: { id: `${id}-learner` } });
		await db.user.create({ data: { id, name, email, learnerId: `${id}-learner` } });
		await db.account.create({
			data: { id: `${id}-account`, accountId: '99', providerId: 'github', userId: id }
		});
		const token = `${id}-session-token`;
		await db.session.create({
			data: {
				id: `${id}-session`,
				token,
				userId: id,
				expiresAt: new Date(Date.now() + 1e9),
				credentialGeneration: ''
			}
		});
		const signature = createHmac('sha256', TEST_SECRET).update(token).digest('base64');
		return {
			id,
			email,
			cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`
		};
	}

	/** Chooses Local: the Instance mode, then its one Learner. */
	async function chooseLocal() {
		await instance.chooseLocal();
		await local.ensureLocalLearner();
	}

	return {
		db,
		instance,
		auth,
		multiUser,
		resolver,
		local,
		setup,
		app,
		handle: createHandle(app),
		admin,
		learner,
		githubOnly,
		chooseLocal
	};
}
