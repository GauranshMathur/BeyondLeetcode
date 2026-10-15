import { type Catalogue, loadCatalogue } from './content/catalogue.ts';
import { createDb, type Db } from './db.ts';
import { type Auth, createAuth, MIN_SECRET_LENGTH } from './identity/auth.ts';
import { createLocalIdentity, type IdentityResolver } from './identity/index.ts';
import { createMultiUserIdentity } from './identity/multi-user.ts';
import { createRegistration } from './identity/registration.ts';
import {
	createFirstAdmin,
	type FirstAdminInput,
	MultiUserNotAvailableError
} from './identity/setup.ts';
import { createInstance, type Instance } from './instance.ts';
import { createLearningCore, type LearningCore } from './learning/core.ts';
import { createHttpRunner } from './runner/http-adapter.ts';
import type { RunnerPort } from './runner/port.ts';
import { createCatalogueScriptedRunner } from './runner/scripted-catalogue.ts';

/** Whether Setup can offer Multi-user on this server, and if not, why. */
export type MultiUserChoice =
	| { kind: 'open' }
	/** Released builds, until Sign in exists (C32): only the browser tests' server can choose it. */
	| { kind: 'later' }
	/** `message` says what to add to `.env`. */
	| { kind: 'needs-env'; message: string };

/** What the Setup screen needs: the Multi-user choice and the step that makes the first admin. */
export interface Setup {
	multiUser: MultiUserChoice;
	/** Refused unless `multiUser` is `open`. Returns the headers whose `Set-Cookie` signs the admin in. */
	createFirstAdmin(input: FirstAdminInput): Promise<{ headers: Headers }>;
}

export interface App {
	core: LearningCore;
	/** Asked once per request in Local Mode: who is it? (Local Mode adapter.) */
	identity: IdentityResolver;
	/** The Instance's mode, read by the hook on every request. One per server: it caches the mode. */
	instance: Instance;
	/** Better Auth and the Multi-user adapter; null when the secret or the origin is not set. */
	multiUser: { auth: Auth; identity: IdentityResolver } | null;
	setup: Setup;
}

/** Wires the Instance at server start: content, database, Learning core, Identity. */
export async function createApp(env: {
	CONTENT_DIR?: string;
	DATABASE_URL?: string;
	RUNNER_URL?: string;
	RUNNER_TOKEN?: string;
	/** '1' turns on the e2e Learner switch; never set outside the e2e web server. */
	IDENTITY_TEST_LEARNER?: string;
	/** 'scripted' swaps the Docker-backed Runner for a scripted one; never set outside the e2e web server. */
	RUNNER_ADAPTER?: string;
	/** Read only to refuse the test switches in production. */
	NODE_ENV?: string;
	/** Signs sessions (Multi-user). Without a valid one, Multi-user cannot be chosen. */
	BETTER_AUTH_SECRET?: string;
	/** The public URL, which SvelteKit also reads; Better Auth needs it for the cookies' Secure flag. */
	ORIGIN?: string;
}): Promise<App> {
	if (!env.CONTENT_DIR) {
		throw new Error('CONTENT_DIR is not set: point it at the content folder (see .env.example).');
	}
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set: point it at the SQLite file (see .env.example).');
	}
	if (env.IDENTITY_TEST_LEARNER === '1' && env.NODE_ENV === 'production') {
		throw new Error(
			'IDENTITY_TEST_LEARNER=1 in production: the test Learner switch is for the browser tests only.'
		);
	}
	const catalogue = await loadCatalogue(env.CONTENT_DIR);
	const runner = chooseRunner(env, catalogue);
	const db = createDb(env.DATABASE_URL);
	const instance = await createInstance(db);
	const auth = buildAuth(env, db, instance);
	const multiUser = auth.kind === 'built' ? chooseMultiUser(auth.auth) : null;
	if (instance.mode() === 'multi') {
		// The test cookie is read only by the Local adapter, which a multi-user Instance never consults;
		// refuse the combination anyway. The browser tests' Multi-user server boots empty and becomes multi.
		if (env.IDENTITY_TEST_LEARNER === '1') {
			throw new Error(
				'IDENTITY_TEST_LEARNER=1 on a multi-user Instance: the test Learner switch must be off once the Instance is multi-user.'
			);
		}
		if (auth.kind === 'missing') {
			throw new Error(`This Instance is Multi-user, but ${auth.message}`);
		}
	}
	const identity = await createLocalIdentity(db, {
		testLearnerCookie: env.IDENTITY_TEST_LEARNER === '1'
	});
	// A fresh database stays empty until someone chooses; an already-Local one gets its Learner at boot.
	if (instance.mode() === 'local') await identity.ensureLocalLearner();
	return {
		instance: {
			...instance,
			async chooseLocal() {
				await instance.chooseLocal();
				await identity.ensureLocalLearner();
			}
		},
		identity,
		multiUser,
		setup: {
			multiUser: choice(env, auth),
			async createFirstAdmin(input) {
				if (choice(env, auth).kind !== 'open' || auth.kind !== 'built') {
					throw new MultiUserNotAvailableError();
				}
				return createFirstAdmin({ instance, auth: auth.auth, db }, input);
			}
		},
		core: createLearningCore({ catalogue, db, runner })
	};
}

type BuiltAuth = { kind: 'built'; auth: Auth } | { kind: 'missing'; message: string };

/**
 * Better Auth, when the secret is set and long enough and ORIGIN is a real http(s) URL. Never with an
 * empty origin: in the image that gives Secure cookies a plain-http browser drops. ORIGIN is the only
 * source: PROTOCOL_HEADER and HOST_HEADER name a different origin per request, which a cookie's Secure
 * flag and Better Auth's origin check cannot follow.
 */
function buildAuth(
	env: { BETTER_AUTH_SECRET?: string; ORIGIN?: string },
	db: Db,
	instance: Instance
): BuiltAuth {
	const secret = env.BETTER_AUTH_SECRET ?? '';
	if (secret === '') {
		return {
			kind: 'missing',
			message:
				'Multi-user needs a secret to sign sessions. Add BETTER_AUTH_SECRET=<48 random hex characters> to your .env (for example from `openssl rand -hex 24`), then restart.'
		};
	}
	if (secret.length < MIN_SECRET_LENGTH) {
		return {
			kind: 'missing',
			message: `BETTER_AUTH_SECRET in your .env is shorter than ${MIN_SECRET_LENGTH} characters. Use 48 random hex characters (for example from \`openssl rand -hex 24\`), then restart.`
		};
	}
	const origin = originOf(env.ORIGIN);
	if (!origin) {
		return {
			kind: 'missing',
			message:
				'Multi-user needs ORIGIN, the public URL of this Instance (for example https://learn.example.com), in your .env; PROTOCOL_HEADER and HOST_HEADER are not enough. Then restart.'
		};
	}
	return {
		kind: 'built',
		auth: createAuth({ db, origin, secret, admitSignUp: createRegistration({ instance }) })
	};
}

function originOf(value: string | undefined): string | null {
	try {
		const url = new URL(value ?? '');
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
	} catch {
		return null;
	}
}

const chooseMultiUser = (auth: Auth) => ({ auth, identity: createMultiUserIdentity(auth) });

/** Released builds keep Multi-user off until Sign in exists (C32 removes the test-switch condition). */
function choice(env: { IDENTITY_TEST_LEARNER?: string }, auth: BuiltAuth): MultiUserChoice {
	if (env.IDENTITY_TEST_LEARNER !== '1') return { kind: 'later' };
	return auth.kind === 'built' ? { kind: 'open' } : { kind: 'needs-env', message: auth.message };
}

/** The HTTP adapter unless RUNNER_ADAPTER=scripted, which only the e2e server may turn on. */
function chooseRunner(
	env: {
		RUNNER_URL?: string;
		RUNNER_TOKEN?: string;
		RUNNER_ADAPTER?: string;
		NODE_ENV?: string;
		IDENTITY_TEST_LEARNER?: string;
	},
	catalogue: Catalogue
): RunnerPort {
	if (env.RUNNER_ADAPTER === 'scripted') {
		if (env.IDENTITY_TEST_LEARNER !== '1' || env.NODE_ENV === 'production') {
			throw new Error(
				'RUNNER_ADAPTER=scripted is for the browser tests only: it needs the e2e test switch and refuses production.'
			);
		}
		return createCatalogueScriptedRunner(catalogue);
	}
	if (
		env.RUNNER_ADAPTER !== undefined &&
		env.RUNNER_ADAPTER !== '' &&
		env.RUNNER_ADAPTER !== 'http'
	) {
		throw new Error(
			`RUNNER_ADAPTER=${env.RUNNER_ADAPTER} is unknown: leave it unset or use 'scripted' (tests only).`
		);
	}
	if (!env.RUNNER_URL) {
		throw new Error('RUNNER_URL is not set: point it at the Runner (see .env.example).');
	}
	if (!env.RUNNER_TOKEN) {
		throw new Error(
			'RUNNER_TOKEN is not set: the bearer token the Runner expects (see .env.example).'
		);
	}
	return createHttpRunner({ url: env.RUNNER_URL, token: env.RUNNER_TOKEN });
}
