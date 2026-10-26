import type { BuildFiles, Catalogue, Language } from '../content/catalogue.ts';
import { LANGUAGES } from '../content/schema.ts';
import type { Db } from '../db.ts';
import { renderMarkdown } from '../markdown.ts';
import { sandboxConfig } from '../runner/config.ts';
import type { ExecuteResult, RunnerPort } from '../runner/port.ts';
import { LearningError } from './errors.ts';
import { loadProgress, recordChapterRead, recordSubmission, resetProgress } from './progress.ts';
import {
	type BuildRef,
	type ChapterView,
	chapterView,
	type HintsView,
	hintsView,
	judge,
	type MapView,
	mapView,
	type ProblemView,
	type ProgressChange,
	problemView,
	type RunView,
	referenceStartOf,
	runView,
	type SavedStep,
	type SolutionView,
	type SubmitView,
	sameBuild,
	seedSourceOf,
	solutionView,
	submitPlan,
	type TopicView,
	topicView,
	validateBuild
} from './rules.ts';

export { LearningError, type LearningErrorCode } from './errors.ts';
export type {
	AcceptedView,
	BuildRef,
	ChapterView,
	HintsView,
	MapTopic,
	MapView,
	ProblemView,
	ProgressChange,
	RunTestStatus,
	RunTestView,
	RunView,
	SolutionView,
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
	 * Stores the Learner's code for a Build. `build` is the reference the screen was issued
	 * (ProblemView.build): `revision` is what the code was based on (0 for a step never saved) and
	 * `language` the Language the tab showed. Throws RevisionConflict when the revision is stale or
	 * the Topic is no longer built in that Language. One exception, so a retried save lands as
	 * saved: a revision exactly one behind whose files equal the stored head (per path, after
	 * validateBuild) is answered with the head's revision and writes nothing: it is a save whose
	 * reply was lost, or one whose result is already stored. Two or more behind is always
	 * RevisionConflict. Throws InvalidBuild for bad paths or too much code, NotFound or TopicLocked.
	 */
	saveCode(build: BuildRef, files: BuildFiles): Promise<{ revision: number }>;
	/**
	 * Replaces the Learner's Build for this Problem and Language with the Reference Code as it stands
	 * after the previous Problem (empty before a Topic's first Problem; an Extra's previous is its
	 * parent). Same checks, errors and retry exception as saveCode (a restart whose reply was lost, sent
	 * again, is answered as started). Returns the new files and revision. Changes no
	 * Submission, progress or Hint.
	 */
	startFromReferenceCode(build: BuildRef): Promise<{ files: BuildFiles; revision: number }>;
	/**
	 * Saves like saveCode (same errors), then runs the Problem's Example Tests only and compares
	 * the outputs. Writes nothing else: never a Submission, status or progress change. Throws
	 * RunnerUnavailable when the Runner cannot answer; the saved code stays and the error carries
	 * its `revision`.
	 */
	run(build: BuildRef, files: BuildFiles): Promise<RunView>;
	/**
	 * Saves like saveCode (same errors), runs every Test of the Problem and of the earlier Core
	 * Problems it builds on, picks the Verdict and records the Submission. Throws
	 * RunnerUnavailable when the Runner cannot answer: nothing is recorded, the saved code stays
	 * and the error carries its `revision`.
	 */
	submit(build: BuildRef, files: BuildFiles): Promise<SubmitView>;
	/**
	 * Builds the Problem's Topic in `language` from now on. Writes only the Learner's choice: a
	 * Language's steps are created when first saved, seeded like any first touch (the Learner's
	 * previous Core step in that Language, else its Reference Code; the first Problem empty). Every
	 * other Language's Builds are kept. Throws NotFound or TopicLocked, InvalidBuild for an unknown Language.
	 */
	switchLanguage(problemId: string, language: Language): Promise<void>;
	/**
	 * The Problem's Hints the Learner has revealed (text), how many there are, and the Chapter they
	 * link back to. Unrevealed Hints are never included. Throws NotFound or TopicLocked. Never writes.
	 */
	hints(problemId: string): Promise<HintsView>;
	/**
	 * Reveals the next Hint (raises the count by one) and returns the view. Free, changes no
	 * progress, safe to call twice at once. Past the last Hint (or with none) it changes nothing and
	 * returns the Hints already revealed. Throws NotFound or TopicLocked.
	 */
	revealHint(problemId: string): Promise<HintsView>;
	/**
	 * The Problem's Solution: the explanation (HTML) and the Reference Code after the Problem in
	 * every Language. Always available, solved or not; never writes, changes no progress or Build.
	 * Throws NotFound or TopicLocked.
	 */
	solution(problemId: string): Promise<SolutionView>;
	/**
	 * Deletes everything this Learner has: read Chapters, saved code, Submissions, the Language
	 * chosen per Topic and revealed Hints, in one transaction. Other Learners and the Learner
	 * itself are untouched; afterwards the Map shows a new Learner. Never fails for lack of progress.
	 */
	resetProgress(): Promise<void>;
}

/** A Topic is built in Python until the Learner switches it. */
const DEFAULT_LANGUAGE: Language = LANGUAGES[0];

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
			/**
			 * The access check every read of a Problem makes, without its view: the Topic id, or
			 * NotFound / TopicLocked. Three queries lighter than `learner.problem` and renders no Markdown.
			 */
			const openStep = async (problemId: string): Promise<string> => {
				const topicId = deps.catalogue.problem(problemId)?.topicId;
				if (topicId === undefined) throw new LearningError('NotFound');
				topicView(deps.catalogue, await loadProgress(deps.catalogue, deps.db, learnerId), topicId); // TopicLocked
				return topicId;
			};
			/**
			 * Save-then-act: saves the Build, then runs `act` with the revision the save produced. A
			 * Runner outage in `act` leaves the saved code, so it is rethrown carrying that revision.
			 */
			const saveThen = async <T>(
				build: BuildRef,
				files: BuildFiles,
				act: (build: BuildRef, revision: number) => Promise<T>
			): Promise<T> => {
				const { revision } = await learner.saveCode(build, files);
				try {
					return await act(build, revision);
				} catch (e) {
					if (e instanceof LearningError && e.code === 'RunnerUnavailable')
						throw new LearningError(e.code, revision);
					throw e;
				}
			};
			const learner: Learner = {
				map: async () =>
					mapView(deps.catalogue, await loadProgress(deps.catalogue, deps.db, learnerId)),
				topic: async (topicId) =>
					topicView(
						deps.catalogue,
						await loadProgress(deps.catalogue, deps.db, learnerId),
						topicId
					),
				chapter: async (chapterId) =>
					chapterView(
						deps.catalogue,
						await loadProgress(deps.catalogue, deps.db, learnerId),
						chapterId,
						renderMarkdown
					),
				reachChapterEnd: (chapterId) => recordChapterRead(deps, learnerId, chapterId, now()),
				problem: async (problemId) => {
					const sourceId = seedSourceOf(deps.catalogue, problemId);
					const topicId = deps.catalogue.problem(problemId)?.topicId ?? '';
					const language = await loadLanguage(deps.db, learnerId, topicId);
					return problemView(
						deps.catalogue,
						await loadProgress(deps.catalogue, deps.db, learnerId),
						problemId,
						language,
						{
							own: await loadStep(deps.db, learnerId, topicId, language, problemId),
							source: sourceId
								? await loadStep(deps.db, learnerId, topicId, language, sourceId)
								: undefined,
							sourceSavedIn: sourceId
								? await languagesSaved(deps.db, learnerId, topicId, sourceId)
								: []
						},
						renderMarkdown
					);
				},
				saveCode: async ({ problemId, language, revision: baseRevision }, files) => {
					// The screen read's checks (NotFound, TopicLocked) and the stored step, no Markdown.
					const topicId = await openStep(problemId);
					const current = await loadLanguage(deps.db, learnerId, topicId);
					const stored = await loadStep(deps.db, learnerId, topicId, current, problemId);
					const view = { topicId, files: stored?.files, revision: stored?.revision ?? 0 };
					const build = validateBuild(files);
					// A tab showing another Language than the current one is stale (switched elsewhere).
					if (language !== current) throw new LearningError('RevisionConflict');
					// Every write below is keyed on the tab's Language, so a switchLanguage landing after
					// this check can only leave the write on the Build the tab was showing.
					const key = { learnerId, topicId: view.topicId, language, problemId };
					if (baseRevision !== view.revision) {
						// A retry of a save whose reply was lost: it committed, so the stored head is one
						// ahead of the tab and holds exactly these files. Answer it as saved; write nothing.
						// Two or more behind stays a conflict, so a later edit back to old code is not mistaken for a retry.
						if (baseRevision === view.revision - 1 && view.files && sameBuild(view.files, build))
							return { revision: view.revision };
						throw new LearningError('RevisionConflict');
					}
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
				startFromReferenceCode: async (build) => {
					await openStep(build.problemId); // NotFound / TopicLocked
					const files = referenceStartOf(deps.catalogue, build.problemId, build.language);
					return { files, ...(await learner.saveCode(build, files)) };
				},
				run: (build, files) =>
					saveThen(build, files, async ({ problemId, language }, revision) => {
						const tests = deps.catalogue.problem(problemId)?.exampleTests ?? [];
						return runView(tests, await execute(language, files, tests), revision);
					}),
				switchLanguage: async (problemId, language) => {
					const topicId = deps.catalogue.problem(problemId)?.topicId;
					if (topicId === undefined) throw new LearningError('NotFound');
					topicView(
						deps.catalogue,
						await loadProgress(deps.catalogue, deps.db, learnerId),
						topicId
					); // TopicLocked
					if (!LANGUAGES.includes(language)) throw new LearningError('InvalidBuild');
					await deps.db.topicLanguage.upsert({
						where: { learnerId_topicId: { learnerId, topicId } },
						create: { learnerId, topicId, language },
						update: { language }
					});
				},
				hints: async (problemId) =>
					hintsView(
						deps.catalogue,
						await loadProgress(deps.catalogue, deps.db, learnerId),
						problemId,
						await loadRevealed(deps.db, learnerId, problemId),
						renderMarkdown
					),
				solution: async (problemId) =>
					solutionView(
						deps.catalogue,
						await loadProgress(deps.catalogue, deps.db, learnerId),
						problemId,
						renderMarkdown
					),
				resetProgress: () => resetProgress(deps.db, learnerId),
				revealHint: async (problemId) => {
					const before = await learner.hints(problemId); // NotFound / TopicLocked
					if (before.revealed.length >= before.total) return before;
					// One atomic step each, never past the count: concurrent reveals each raise it by
					// one until the last Hint, then the rest change nothing.
					const raise = () =>
						deps.db.hintsRevealed.updateMany({
							where: { learnerId, problemId, count: { lt: before.total } },
							data: { count: { increment: 1 } }
						});
					if ((await raise()).count === 0) {
						try {
							await deps.db.hintsRevealed.create({ data: { learnerId, problemId, count: 1 } });
						} catch (e) {
							if ((e as { code?: string }).code !== 'P2002') throw e;
							// The row appeared meanwhile (or is already at the last Hint).
							await raise();
						}
					}
					return learner.hints(problemId);
				},
				submit: (build, files) =>
					saveThen(build, files, async ({ problemId, language }, revision) => {
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
						const { submissionId, solved, accepted } = await recordSubmission(deps, learnerId, {
							learnerId,
							problemId,
							topicId,
							language,
							files,
							verdict,
							failingProblemId: failingProblemId ?? null,
							createdAt: now()
						});
						return {
							submissionId,
							verdict,
							...(failure && { failure }),
							revision,
							status: solved ? 'Solved' : 'Attempted',
							...(accepted && { accepted })
						};
					})
			};
			return learner;
		}
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

/** The Languages in which the Learner has saved this step. */
async function languagesSaved(
	db: Db,
	learnerId: string,
	topicId: string,
	problemId: string
): Promise<Language[]> {
	const rows = await db.buildStep.findMany({
		where: { learnerId, topicId, problemId },
		select: { language: true }
	});
	return LANGUAGES.filter((l) => rows.some((r) => r.language === l));
}

/** How many of a Problem's Hints the Learner has revealed. */
async function loadRevealed(db: Db, learnerId: string, problemId: string): Promise<number> {
	const row = await db.hintsRevealed.findUnique({
		where: { learnerId_problemId: { learnerId, problemId } }
	});
	return row?.count ?? 0;
}
