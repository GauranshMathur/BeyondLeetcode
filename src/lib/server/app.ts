import { loadCatalogue } from './content/catalogue.ts';
import { createDb } from './db.ts';
import { createLocalIdentity, type IdentityResolver } from './identity/index.ts';
import { createInstance, type Instance } from './instance.ts';
import { createLearningCore, type LearningCore } from './learning/core.ts';
import { createHttpRunner } from './runner/http-adapter.ts';

export interface App {
	core: LearningCore;
	/** Asked once per request: who is it? (Local Mode adapter.) */
	identity: IdentityResolver;
	/** The Instance's mode, read by the hook on every request. One per server: it caches the mode. */
	instance: Instance;
}

/** Wires the Instance at server start: content, database, Learning core, Identity. */
export async function createApp(env: {
	CONTENT_DIR?: string;
	DATABASE_URL?: string;
	RUNNER_URL?: string;
	RUNNER_TOKEN?: string;
	/** '1' turns on the e2e Learner switch; never set outside the e2e web server. */
	IDENTITY_TEST_LEARNER?: string;
	/** Read only to refuse the test Learner switch in production. */
	NODE_ENV?: string;
}): Promise<App> {
	if (!env.CONTENT_DIR) {
		throw new Error('CONTENT_DIR is not set: point it at the content folder (see .env.example).');
	}
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set: point it at the SQLite file (see .env.example).');
	}
	if (!env.RUNNER_URL) {
		throw new Error('RUNNER_URL is not set: point it at the Runner (see .env.example).');
	}
	if (!env.RUNNER_TOKEN) {
		throw new Error(
			'RUNNER_TOKEN is not set: the bearer token the Runner expects (see .env.example).'
		);
	}
	if (env.IDENTITY_TEST_LEARNER === '1' && env.NODE_ENV === 'production') {
		throw new Error(
			'IDENTITY_TEST_LEARNER=1 in production: the test Learner switch is for the browser tests only.'
		);
	}
	const catalogue = await loadCatalogue(env.CONTENT_DIR);
	const db = createDb(env.DATABASE_URL);
	const instance = await createInstance(db);
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
		core: createLearningCore({
			catalogue,
			db,
			runner: createHttpRunner({ url: env.RUNNER_URL, token: env.RUNNER_TOKEN })
		})
	};
}
