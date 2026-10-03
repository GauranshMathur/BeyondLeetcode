import type { BuildFiles, Catalogue, Language } from '../content/catalogue.ts';
import type { Db } from '../db.ts';
import { renderMarkdown } from '../markdown.ts';
import { sandboxConfig } from '../runner/config.ts';
import type { ExecuteResult, RunnerPort } from '../runner/port.ts';
import { LearningError } from './errors.ts';
import {
	type ChapterView,
	chapterView,
	type MapView,
	mapView,
	type ProblemView,
	type Progress,
	type ProgressChange,
	problemView,
	type RunView,
	reachChapter,
	runView,
	type SavedStep,
	seedSourceOf,
	type TopicView,
	topicView,
	validateBuild
} from './rules.ts';

export { LearningError, type LearningErrorCode } from './errors.ts';
export type {
	ChapterView,
	MapTopic,
	MapView,
	ProblemView,
	ProgressChange,
	RunTestStatus,
	RunTestView,
	RunView,
	TopicState,
	TopicView
} from './rules.ts';

export interface LearningCoreDeps {
	catalogue: Catalogue;
	db: Db;
	/** Needed by Run (and Submit); without it Run answers RunnerUnavailable. */
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
	/** One Problem with the Learner's code for it. Throws NotFound or TopicLocked. Never writes. */
	problem(problemId: string): Promise<ProblemView>;
	/**
	 * Stores the Learner's code for a Problem. `baseRevision` is the revision the code was based
	 * on (0 for a step never saved). Throws RevisionConflict when it is stale, InvalidBuild for
	 * bad paths or too much code, NotFound or TopicLocked.
	 */
	saveCode(
		problemId: string,
		files: BuildFiles,
		baseRevision: number
	): Promise<{ revision: number }>;
	/**
	 * Saves like saveCode (same errors), then runs the Problem's Example Tests only and compares
	 * the outputs. Writes nothing else: never a Submission, status or progress change. Throws
	 * RunnerUnavailable when the Runner cannot answer; the saved code stays.
	 */
	run(problemId: string, files: BuildFiles, baseRevision: number): Promise<RunView>;
}

/** Every Build is Python until the Language picker (C7a). */
const DEFAULT_LANGUAGE: Language = 'python';

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
		forLearner: (learnerId) => {
			const learner: Learner = {
				map: async () => mapView(deps.catalogue, await loadProgress(deps, learnerId)),
				topic: async (topicId) =>
					topicView(deps.catalogue, await loadProgress(deps, learnerId), topicId),
				chapter: async (chapterId) =>
					chapterView(
						deps.catalogue,
						await loadProgress(deps, learnerId),
						chapterId,
						renderMarkdown
					),
				reachChapterEnd: async (chapterId) => {
					const before = await loadProgress(deps, learnerId);
					const change = reachChapter(deps.catalogue, before, chapterId); // NotFound / TopicLocked
					if (before.readChapters.has(chapterId)) return change;
					// Only the call that inserts the mark reports the change; a concurrent repeat gets none.
					try {
						await deps.db.chapterRead.create({ data: { learnerId, chapterId, readAt: now() } });
					} catch (e) {
						if (!isUniqueViolation(e)) throw e;
						return reachChapter(deps.catalogue, await loadProgress(deps, learnerId), chapterId);
					}
					// Diff against the state without this mark, so a concurrent read cannot hide the effect.
					const after = await loadProgress(deps, learnerId);
					const readChapters = new Set(after.readChapters);
					readChapters.delete(chapterId);
					return reachChapter(deps.catalogue, { ...after, readChapters }, chapterId);
				},
				problem: async (problemId) => {
					const sourceId = seedSourceOf(deps.catalogue, problemId);
					const topicId = deps.catalogue.problem(problemId)?.topicId ?? '';
					return problemView(
						deps.catalogue,
						await loadProgress(deps, learnerId),
						problemId,
						DEFAULT_LANGUAGE,
						{
							own: await loadStep(deps.db, learnerId, topicId, problemId),
							source: sourceId ? await loadStep(deps.db, learnerId, topicId, sourceId) : undefined
						},
						renderMarkdown
					);
				},
				saveCode: async (problemId, files, baseRevision) => {
					// Same checks as the screen read: NotFound, TopicLocked.
					const view = await learner.problem(problemId);
					const build = validateBuild(files);
					const key = {
						learnerId,
						topicId: view.topicId,
						language: DEFAULT_LANGUAGE,
						problemId
					};
					if (baseRevision !== view.revision) throw new LearningError('RevisionConflict');
					try {
						if (view.revision === 0) {
							await deps.db.buildStep.create({ data: { ...key, files: build, revision: 1 } });
							return { revision: 1 };
						}
						// Only the save still based on the stored revision updates it.
						const { count } = await deps.db.buildStep.updateMany({
							where: { ...key, revision: baseRevision },
							data: { files: build, revision: baseRevision + 1 }
						});
						if (count === 0) throw new LearningError('RevisionConflict');
						return { revision: baseRevision + 1 };
					} catch (e) {
						if ((e as { code?: string }).code === 'P2002')
							throw new LearningError('RevisionConflict');
						throw e;
					}
				},
				run: async (problemId, files, baseRevision) => {
					const { revision } = await learner.saveCode(problemId, files, baseRevision);
					const tests = deps.catalogue.problem(problemId)?.exampleTests ?? [];
					if (!deps.runner) throw new LearningError('RunnerUnavailable');
					let result: ExecuteResult;
					try {
						result = await deps.runner.execute({
							language: DEFAULT_LANGUAGE,
							files,
							tests: tests.map(({ id, input }) => ({ id, input })),
							limits: { timeoutMs: sandboxConfig.testTimeoutMs, memoryMb: sandboxConfig.memoryMb }
						});
					} catch {
						throw new LearningError('RunnerUnavailable');
					}
					return runView(tests, result, revision);
				}
			};
			return learner;
		}
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

/** The Learner's stored code for one step, if it was ever saved. */
async function loadStep(
	db: Db,
	learnerId: string,
	topicId: string,
	problemId: string
): Promise<SavedStep | undefined> {
	const row = await db.buildStep.findUnique({
		where: {
			learnerId_topicId_language_problemId: {
				learnerId,
				topicId,
				language: DEFAULT_LANGUAGE,
				problemId
			}
		}
	});
	return row ? { files: row.files as BuildFiles, revision: row.revision } : undefined;
}

/** Prisma's error code for a second row with the same unique key. */
function isUniqueViolation(e: unknown): boolean {
	return (e as { code?: string } | null)?.code === 'P2002';
}
