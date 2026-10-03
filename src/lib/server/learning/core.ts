import type { Catalogue } from '../content/catalogue.ts';
import type { Db } from '../db.ts';
import type { RunnerPort } from '../runner/port.ts';
import { type MapView, mapView, type Progress, type TopicView, topicView } from './rules.ts';

export { LearningError, type LearningErrorCode } from './errors.ts';
export type { MapTopic, MapView, TopicState, TopicView } from './rules.ts';

export interface LearningCoreDeps {
	catalogue: Catalogue;
	db: Db;
	/** Needed from C5b (Run and Submit); not used by the Map. */
	runner?: RunnerPort;
	clock?: () => Date;
}

export interface Learner {
	/** The Topic Map with every Topic's state and Core solved count. Never writes. */
	map(): Promise<MapView>;
	/** One Topic's Chapters and Problems. Throws LearningError NotFound or TopicLocked. Never writes. */
	topic(topicId: string): Promise<TopicView>;
}

export interface LearningCore {
	/** Every call on the returned Learner acts for this one Learner. */
	forLearner(learnerId: string): Learner;
}

/**
 * The Learning core (docs/module-map.md): every product rule behind one interface.
 * The rules are pure functions in ./rules.ts; this shell loads state and calls them.
 */
export function createLearningCore(deps: LearningCoreDeps): LearningCore {
	return {
		forLearner: (learnerId) => ({
			map: async () => mapView(deps.catalogue, await loadProgress(deps.db, learnerId)),
			topic: async (topicId) =>
				topicView(deps.catalogue, await loadProgress(deps.db, learnerId), topicId)
		})
	};
}

/** Read marks and Submissions have no tables yet (C3 and C6a add them), so nothing is done yet. */
async function loadProgress(_db: Db, _learnerId: string): Promise<Progress> {
	return { readChapters: new Set(), solvedProblems: new Set() };
}
