import { type Catalogue, loadCatalogue } from './content/catalogue.ts';
import { createDb } from './db.ts';
import { createIdentity, createLocalIdentity, type InstanceIdentity } from './identity/index.ts';
import { createMultiUserInstance, type MultiUser } from './identity/multi-user-instance.ts';
import { parseOrigin } from './identity/origin.ts';
import { MIN_SECRET_LENGTH, secretProblem } from './identity/secret.ts';
import { createFirstAdmin, type FirstAdminInput } from './identity/setup.ts';
import { createInstance, type Instance } from './instance.ts';
import { createLearningCore, type LearningCore } from './learning/core.ts';
import { createHttpRunner } from './runner/http-adapter.ts';
import type { RunnerPort } from './runner/port.ts';
import { createCatalogueScriptedRunner } from './runner/scripted-catalogue.ts';

/** Whether Setup can offer Multi-user on this server, and if not, why. */
export type MultiUserChoice =
	| { kind: 'open' }
	/** `message` says what to add to `.env`. */
	| { kind: 'needs-env'; message: string };

/** What the Setup screen needs: the Multi-user choice and the step that makes the first admin. */
export interface Setup {
	multiUser: MultiUserChoice;
	/** Refused unless `multiUser` is `open`. Returns the headers whose `Set-Cookie` signs the admin in. */
	createFirstAdmin(input: FirstAdminInput): Promise<{ headers: Headers }>;
}

export type { MultiUser };

export interface App {
	core: LearningCore;
	/** Asked once per request: who is it? It reads the Instance mode and asks the one adapter that names. */
	identity: InstanceIdentity;
	/** The Instance's mode, read by the hook on every request. One per server: it caches the mode. */
	instance: Instance;
	/** Better Auth and the Multi-user adapter; null when the secret or the origin is not set. */
	multiUser: MultiUser | null;
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
	/** OAuth providers (optional): a provider is offered only when both of its variables are set. */
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
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
	const auth = multiUserEnvironment(env);
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
	// Built once per process; on a multi-user Instance this also runs the start-up repair.
	const multi =
		auth.kind === 'ready' ? await createMultiUserInstance({ db, instance, ...auth.options }) : null;
	const multiUser = multi?.multiUser ?? null;
	const local = await createLocalIdentity(db, {
		testLearnerCookie: env.IDENTITY_TEST_LEARNER === '1'
	});
	// A fresh database stays empty until someone chooses; an already-Local one gets its Learner at boot.
	if (instance.mode() === 'local') await local.ensureLocalLearner();
	return {
		instance: {
			...instance,
			async chooseLocal() {
				await instance.chooseLocal();
				await local.ensureLocalLearner();
			}
		},
		identity: createIdentity({
			instance,
			local,
			multi: multi?.resolver ?? null
		}),
		multiUser,
		setup: {
			multiUser: choice(auth),
			async createFirstAdmin(input) {
				if (!multi) throw new Error('Multi-user is not available on this server.');
				return createFirstAdmin({ instance, auth: multi.auth, db }, input);
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
 * only when no base URL is passed, and the factory always gets ORIGIN. AUTH_SECRET is read only
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

type MultiUserEnvironment =
	| {
			kind: 'ready';
			options: Pick<
				Parameters<typeof createMultiUserInstance>[0],
				'secret' | 'origin' | 'providerEnv'
			>;
	  }
	| { kind: 'missing'; message: string };

/**
 * What Multi-user needs from the environment, when the secret is set and long enough and ORIGIN is a
 * real http(s) URL. Never with an empty origin: in the image that gives Secure cookies a plain-http
 * browser drops. ORIGIN is the only source: PROTOCOL_HEADER and HOST_HEADER name a different origin per
 * request, which a cookie's Secure flag and Better Auth's origin check cannot follow.
 */
function multiUserEnvironment(
	env: { BETTER_AUTH_SECRET?: string; ORIGIN?: string } & Record<string, string | undefined>
): MultiUserEnvironment {
	const secret = env.BETTER_AUTH_SECRET ?? '';
	const problem = secretProblem(secret);
	if (problem === 'missing') {
		return {
			kind: 'missing',
			message:
				'Multi-user needs a secret to sign sessions. Add BETTER_AUTH_SECRET=<48 random hex characters> to your .env (for example from `openssl rand -hex 24`), then restart.'
		};
	}
	if (problem === 'placeholder') {
		return {
			kind: 'missing',
			message:
				'BETTER_AUTH_SECRET in your .env is still a placeholder or default value that anyone can read. Replace it with 48 random hex characters (for example from `openssl rand -hex 24`), then restart.'
		};
	}
	if (problem === 'short') {
		return {
			kind: 'missing',
			message: `BETTER_AUTH_SECRET in your .env is shorter than ${MIN_SECRET_LENGTH} characters. Use 48 random hex characters (for example from \`openssl rand -hex 24\`), then restart.`
		};
	}
	const origin = parseOrigin(env.ORIGIN);
	if (!origin) {
		return {
			kind: 'missing',
			message:
				'Multi-user needs ORIGIN, the public URL of this Instance (for example https://learn.example.com), in your .env; PROTOCOL_HEADER and HOST_HEADER are not enough. Then restart.'
		};
	}
	return { kind: 'ready', options: { secret, origin, providerEnv: providerEnvironment(env) } };
}

/**
 * The provider variables: the ones the caller passed, else the process environment (which is where a
 * container's variables are). A provider with only one of its two is left out (`socialProvidersFrom`).
 */
function providerEnvironment(
	env: Record<string, string | undefined>
): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	for (const name of [
		'GITHUB_CLIENT_ID',
		'GITHUB_CLIENT_SECRET',
		'GOOGLE_CLIENT_ID',
		'GOOGLE_CLIENT_SECRET'
	]) {
		out[name] = env[name] ?? process.env[name];
	}
	return out;
}

/** Multi-user is open to every Instance that has what Better Auth needs; otherwise Setup says what to add. */
function choice(auth: MultiUserEnvironment): MultiUserChoice {
	return auth.kind === 'ready' ? { kind: 'open' } : { kind: 'needs-env', message: auth.message };
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
