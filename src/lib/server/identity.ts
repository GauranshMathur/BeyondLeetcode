import type { Db } from './db.ts';

/** The Local Learner's fixed id: one row per Instance, so concurrent first requests cannot make two. */
const LOCAL_LEARNER_ID = 'local';

/** Local Mode: the id of the single Learner, creating that Learner on first use. */
export async function localLearnerId(db: Db): Promise<string> {
	const { id } = await db.learner.upsert({
		where: { id: LOCAL_LEARNER_ID },
		update: {},
		create: { id: LOCAL_LEARNER_ID }
	});
	return id;
}
