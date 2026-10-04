import type { BuildFiles, Catalogue, Language } from '../content/catalogue.ts';
import { LANGUAGES } from '../content/schema.ts';
import type { Db } from '../db.ts';
import { renderMarkdown } from '../markdown.ts';
import { sandboxConfig } from '../runner/config.ts';
import type { ExecuteResult, RunnerPort } from '../runner/port.ts';
import { LearningError } from './errors.ts';
import {
	acceptedDiff,
	type ChapterView,
	chapterView,
	judge,
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
	type SubmitView,
	seedSourceOf,
	submitPlan,
	type TopicView,
	topicView,
	validateBuild
} from './rules.ts';

export { LearningError, type LearningErrorCode } from './errors.ts';
export type {
	AcceptedView,
	ChapterView,
	MapTopic,
	MapView,
	ProblemView,
	ProgressChange,
	RunTestStatus,
	RunTestView,
	RunView,
	SubmitFailure,
	SubmitView,
	TopicState,
	TopicView,
	Verdict
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
	 * on (0 for a step never saved) and `language` the Language the tab showed (ProblemView.language).
	 * Throws RevisionConflict when the revision is stale or the Topic is no longer built in
	 * `language`, InvalidBuild for bad paths or too much code, NotFound or TopicLocked.
	 */
	saveCode(
		problemId: string,
		files: BuildFiles,
		baseRevision: number,
		language: Language
	): Promise<{ revision: number }>;
	/**
	 * Saves like saveCode (same errors), then runs the Problem's Example Tests only and compares
	 * the outputs. Writes nothing else: never a Submission, status or progress change. Throws
	 * RunnerUnavailable when the Runner cannot answer; the saved code stays.
	 */
	run(
		problemId: string,
		files: BuildFiles,
		baseRevision: number,
		language: Language
	): Promise<RunView>;
	/**
	 * Saves like saveCode (same errors), runs every Test of the Problem and of the earlier Core
	 * Problems it builds on, picks the Verdict and records the Submission. Throws
	 * RunnerUnavailable when the Runner cannot answer: nothing is recorded, the saved code stays.
	 */
	submit(
		problemId: string,
		files: BuildFiles,
		baseRevision: number,
		language: Language
	): Promise<SubmitView>;
	/**
	 * Builds the Topic in `language` from now on. Writes only the Learner's choice: a Language's
	 * steps are created when first saved, seeded like any first touch (the Learner's previous Core
	 * step in that Language, else its Reference Code; the first Problem empty). Every other
	 * Language's Builds are kept. Throws NotFound or TopicLocked, InvalidBuild for an unknown Language.
	 */
	switchLanguage(topicId: string, language: Language): Promise<void>;
}

/** A Topic is built in Python until the Learner switches it. */
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
			/** Sends code and Test inputs (never expected outputs) to the Runner; any failure is RunnerUnavailable. */
			const execute = async (
				language: Language,
				files: BuildFiles,
				tests: readonly { id: string; input: string }[]
			): Promise<ExecuteResult> => {
				if (!deps.runner) throw new LearningError('RunnerUnavailable');
				try {
					return await deps.runner.execute({
						language,
						files,
						tests: tests.map(({ id, input }) => ({ id, input })),
						limits: { timeoutMs: sandboxConfig.testTimeoutMs, memoryMb: sandboxConfig.memoryMb }
					});
				} catch {
					throw new LearningError('RunnerUnavailable');
				}
			};
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
					const language = await loadLanguage(deps.db, learnerId, topicId);
					return problemView(
						deps.catalogue,
						await loadProgress(deps, learnerId),
						problemId,
						language,
						{
							own: await loadStep(deps.db, learnerId, topicId, language, problemId),
							source: sourceId
								? await loadStep(deps.db, learnerId, topicId, language, sourceId)
								: undefined
						},
						renderMarkdown
					);
				},
				saveCode: async (problemId, files, baseRevision, language) => {
					// Same checks as the screen read: NotFound, TopicLocked.
					const view = await learner.problem(problemId);
					const build = validateBuild(files);
					// A tab showing another Language than the current one is stale (switched elsewhere).
					if (language !== view.language) throw new LearningError('RevisionConflict');
					// Every write below is keyed on the tab's Language, so a switchLanguage landing after
					// this check can only leave the write on the Build the tab was showing.
					const key = { learnerId, topicId: view.topicId, language, problemId };
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
				run: async (problemId, files, baseRevision, language) => {
					const { revision } = await learner.saveCode(problemId, files, baseRevision, language);
					const tests = deps.catalogue.problem(problemId)?.exampleTests ?? [];
					return runView(tests, await execute(language, files, tests), revision);
				},
				switchLanguage: async (topicId, language) => {
					topicView(deps.catalogue, await loadProgress(deps, learnerId), topicId); // NotFound / TopicLocked
					if (!LANGUAGES.includes(language)) throw new LearningError('InvalidBuild');
					await deps.db.topicLanguage.upsert({
						where: { learnerId_topicId: { learnerId, topicId } },
						create: { learnerId, topicId, language },
						update: { language }
					});
				},
				submit: async (problemId, files, baseRevision, language) => {
					const { revision } = await learner.saveCode(problemId, files, baseRevision, language);
					// Two containers: nothing a Hidden Test runs shares one with a Test whose output is shown.
					const plan = submitPlan(deps.catalogue, problemId);
					const batches = [];
					if (plan.visible.length > 0) {
						batches.push({
							tests: plan.visible,
							result: await execute(language, files, plan.visible)
						});
					}
					if (!batches[0]?.result.compileError && plan.hidden.length > 0) {
						const result = await execute(language, files, plan.hidden);
						// The code compiled in call 1; a message here is not for the Learner (it ran with Hidden inputs).
						if (result.compileError !== undefined) throw new LearningError('RunnerUnavailable');
						batches.push({ tests: plan.hidden, result });
					}
					const { verdict, failure, failingProblemId } = judge(
						batches,
						problemId,
						(id) => deps.catalogue.problem(id)?.title ?? id
					);
					const topicId = deps.catalogue.problem(problemId)?.topicId ?? '';
					const before = await loadProgress(deps, learnerId);
					const { id: submissionId } = await deps.db.submission.create({
						data: {
							learnerId,
							problemId,
							topicId,
							language,
							files,
							verdict,
							failingProblemId: failingProblemId ?? null,
							createdAt: now()
						}
					});
					const progress = await loadProgress(deps, learnerId);
					return {
						submissionId,
						verdict,
						...(failure && { failure }),
						revision,
						status: progress.solvedProblems.has(problemId) ? 'Solved' : 'Attempted',
						...(verdict === 'Accepted' && {
							accepted: acceptedDiff(deps.catalogue, before, progress, problemId)
						})
					};
				}
			};
			return learner;
		}
	};
}

/** Read marks and Submissions give every status; the Topic of the latest activity is the current one. */
async function loadProgress(deps: LearningCoreDeps, learnerId: string): Promise<Progress> {
	const reads = await deps.db.chapterRead.findMany({
		where: { learnerId },
		orderBy: { readAt: 'desc' }
	});
	const submissions = await deps.db.submission.findMany({
		where: { learnerId },
		orderBy: { createdAt: 'desc' },
		select: { problemId: true, topicId: true, verdict: true, createdAt: true }
	});
	const solved = new Set(
		submissions.filter((s) => s.verdict === 'Accepted').map((s) => s.problemId)
	);
	const attempted = new Set(submissions.map((s) => s.problemId).filter((id) => !solved.has(id)));
	const recentRead = reads[0];
	const recentSubmission = submissions[0];
	const recentTopicId =
		recentSubmission && (!recentRead || recentSubmission.createdAt >= recentRead.readAt)
			? recentSubmission.topicId
			: recentRead && deps.catalogue.chapter(recentRead.chapterId)?.topicId;
	return {
		readChapters: new Set(reads.map((r) => r.chapterId)),
		solvedProblems: solved,
		attemptedProblems: attempted,
		...(recentTopicId && { recentTopicId })
	};
}

/** The Language the Learner builds a Topic in; Python until they switch. */
async function loadLanguage(db: Db, learnerId: string, topicId: string): Promise<Language> {
	const row = await db.topicLanguage.findUnique({
		where: { learnerId_topicId: { learnerId, topicId } }
	});
	return LANGUAGES.find((l) => l === row?.language) ?? DEFAULT_LANGUAGE;
}

/** The Learner's stored code for one step in one Language, if it was ever saved. */
async function loadStep(
	db: Db,
	learnerId: string,
	topicId: string,
	language: Language,
	problemId: string
): Promise<SavedStep | undefined> {
	const row = await db.buildStep.findUnique({
		where: {
			learnerId_topicId_language_problemId: {
				learnerId,
				topicId,
				language,
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
