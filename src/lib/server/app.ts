import { type Catalogue, loadCatalogue } from './content/catalogue.ts';
import { createDb, type Db } from './db.ts';
import { type Auth, createAuth, isPlaceholderSecret, MIN_SECRET_LENGTH } from './identity/auth.ts';
import { createLocalIdentity, type IdentityResolver } from './identity/index.ts';
import { createInvites, type Invites } from './identity/invites.ts';
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
	/**
	 * Never produced since C32: every Instance with what Better Auth needs is `open`. Only still named
	 * because test stubs outside Setup's files (`signup-gate.test.ts`, `users.test.ts`) build one; delete
	 * the variant, and the handling of it in Setup, once they stop.
	 */
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
	multiUser: { auth: Auth; identity: IdentityResolver; invites: Invites } | null;
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
	refuseAuthEnvOverrides();
	const catalogue = await loadCatalogue(env.CONTENT_DIR);
	const runner = chooseRunner(env, catalogue);
	const db = createDb(env.DATABASE_URL);
	const instance = await createInstance(db);
	const auth = buildAuth(env, db, instance);
	const multiUser = auth.kind === 'built' ? chooseMultiUser(auth, db) : null;
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
			multiUser: choice(auth),
			async createFirstAdmin(input) {
				if (auth.kind !== 'built') {
					throw new MultiUserNotAvailableError();
				}
				return createFirstAdmin({ instance, auth: auth.auth, db }, input);
			}
		},
		core: createLearningCore({ catalogue, db, runner })
	};
}

/**
 * Settings Better Auth reads from the process environment on its own, and that win over what
 * `createAuth` passes it. Each is refused while it is set, in every mode: it would take effect the
 * moment Multi-user is chosen. The messages are fixed strings; they never print the value.
 *
 * Read from `process.env`, where Better Auth reads, not from the `env` argument: a copy of the
 * environment that misses a variable would let it through.
 *
 * BETTER_AUTH_URL, PUBLIC_BETTER_AUTH_URL and BASE_URL are not on the list: Better Auth reads them
 * only when no base URL is passed, and `buildAuth` always passes ORIGIN. AUTH_SECRET is read only
 * when no secret is passed. BETTER_AUTH_TELEMETRY does not touch the secret, the origin or the cookies.
 */
const AUTH_ENV_OVERRIDES: Record<string, string> = {
	BETTER_AUTH_SECRETS:
		'BETTER_AUTH_SECRETS is set. Better Auth would sign sessions with it instead of BETTER_AUTH_SECRET, which this app checks. Remove it from the environment, then restart.',
	BETTER_AUTH_TRUSTED_ORIGINS:
		'BETTER_AUTH_TRUSTED_ORIGINS is set. Better Auth would accept requests from origins other than ORIGIN. Remove it from the environment, then restart.'
};

function refuseAuthEnvOverrides(): void {
	for (const [name, message] of Object.entries(AUTH_ENV_OVERRIDES)) {
		// Empty is ignored by Better Auth, so it is not an override.
		if (process.env[name]) throw new Error(message);
	}
}

type BuiltAuth =
	| { kind: 'built'; auth: Auth; origin: string }
	| { kind: 'missing'; message: string };

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
	if (isPlaceholderSecret(secret)) {
		return {
			kind: 'missing',
			message:
				'BETTER_AUTH_SECRET in your .env is still a placeholder or default value that anyone can read. Replace it with 48 random hex characters (for example from `openssl rand -hex 24`), then restart.'
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
		origin,
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

const chooseMultiUser = (built: Extract<BuiltAuth, { kind: 'built' }>, db: Db) => ({
	auth: built.auth,
	identity: createMultiUserIdentity(built.auth),
	// Invite links name the same ORIGIN the cookies and the origin check use.
	invites: createInvites({ db, origin: built.origin })
});

/** Multi-user is open to every Instance that has what Better Auth needs; otherwise Setup says what to add. */
function choice(auth: BuiltAuth): MultiUserChoice {
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
