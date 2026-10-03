import { loadCatalogue } from './content/catalogue.ts';
import { createDb } from './db.ts';
import { localLearnerId } from './identity.ts';
import { createLearningCore, type LearningCore } from './learning/core.ts';
import { createHttpRunner } from './runner/http-adapter.ts';

export interface App {
	core: LearningCore;
	/** Local Mode: the single Learner. */
	learnerId: string;
}

/** Wires the Instance at server start: content, database, Learning core, Local Learner. */
export async function createApp(env: {
	CONTENT_DIR?: string;
	DATABASE_URL?: string;
	RUNNER_URL?: string;
	RUNNER_TOKEN?: string;
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
	const catalogue = await loadCatalogue(env.CONTENT_DIR);
	const db = createDb(env.DATABASE_URL);
	return {
		core: createLearningCore({
			catalogue,
			db,
			runner: createHttpRunner({ url: env.RUNNER_URL, token: env.RUNNER_TOKEN })
		}),
		learnerId: await localLearnerId(db)
	};
}
