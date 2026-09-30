import { loadCatalogue } from './content/catalogue.ts';
import { createDb } from './db.ts';
import { localLearnerId } from './identity.ts';
import { createLearningCore, type LearningCore } from './learning/core.ts';

export interface App {
	core: LearningCore;
	/** Local Mode: the single Learner. */
	learnerId: string;
}

/** Wires the Instance at server start: content, database, Learning core, Local Learner. */
export async function createApp(env: {
	CONTENT_DIR?: string;
	DATABASE_URL?: string;
}): Promise<App> {
	if (!env.CONTENT_DIR) {
		throw new Error('CONTENT_DIR is not set: point it at the content folder (see .env.example).');
	}
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set: point it at the SQLite file (see .env.example).');
	}
	const catalogue = await loadCatalogue(env.CONTENT_DIR);
	const db = createDb(env.DATABASE_URL);
	return { core: createLearningCore({ catalogue, db }), learnerId: await localLearnerId(db) };
}
