import type { Catalogue } from '../content/catalogue.ts';
import type { Db } from '../db.ts';
import { renderMarkdown } from '../markdown.ts';
import type { RunnerPort } from '../runner/port.ts';
import {
	type ChapterView,
	chapterView,
	type MapView,
	mapView,
	type Progress,
	type ProgressChange,
	reachChapter,
	type TopicView,
	topicView
} from './rules.ts';

export { LearningError, type LearningErrorCode } from './errors.ts';
export type {
	ChapterView,
	MapTopic,
	MapView,
	ProgressChange,
	TopicState,
	TopicView
} from './rules.ts';

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
	/** One Chapter with its rendered body and Problems. Throws NotFound or TopicLocked. Never writes. */
	chapter(chapterId: string): Promise<ChapterView>;
	/** The Learner reached the end of a Chapter: marks it Read. Idempotent. Throws NotFound or TopicLocked. */
	reachChapterEnd(chapterId: string): Promise<ProgressChange>;
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
	const now = () => (deps.clock ?? (() => new Date()))();
	return {
		forLearner: (learnerId) => ({
			map: async () => mapView(deps.catalogue, await loadProgress(deps, learnerId)),
			topic: async (topicId) =>
				topicView(deps.catalogue, await loadProgress(deps, learnerId), topicId),
			chapter: async (chapterId) =>
				chapterView(deps.catalogue, await loadProgress(deps, learnerId), chapterId, renderMarkdown),
			reachChapterEnd: async (chapterId) => {
				const before = await loadProgress(deps, learnerId);
				const change = reachChapter(deps.catalogue, before, chapterId); // NotFound / TopicLocked
				if (before.readChapters.has(chapterId)) return change;
				// Only the call that inserts the mark reports the change; a concurrent repeat gets none.
				try {
					await deps.db.chapterRead.create({ data: { learnerId, chapterId, readAt: now() } });
				} catch (e) {
					if ((e as { code?: string }).code !== 'P2002') throw e;
					return reachChapter(deps.catalogue, await loadProgress(deps, learnerId), chapterId);
				}
				// Diff against the state without this mark, so a concurrent read cannot hide the effect.
				const after = await loadProgress(deps, learnerId);
				const readChapters = new Set(after.readChapters);
				readChapters.delete(chapterId);
				return reachChapter(deps.catalogue, { ...after, readChapters }, chapterId);
			}
		})
	};
}

/** Solved and Attempted have no table until C6a adds Submissions. */
async function loadProgress(deps: LearningCoreDeps, learnerId: string): Promise<Progress> {
	const reads = await deps.db.chapterRead.findMany({
		where: { learnerId },
		orderBy: { readAt: 'desc' }
	});
	const recentChapter = reads[0] && deps.catalogue.chapter(reads[0].chapterId);
	return {
		readChapters: new Set(reads.map((r) => r.chapterId)),
		solvedProblems: new Set(),
		attemptedProblems: new Set(),
		...(recentChapter && { recentTopicId: recentChapter.topicId })
	};
}
