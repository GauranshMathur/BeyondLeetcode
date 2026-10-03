import type { BuildFiles, Catalogue, Language } from '../content/catalogue.ts';
import type { ExecuteResult } from '../runner/port.ts';
import { LearningError } from './errors.ts';

/** What a Learner has done: Read marks and Solved Problems, by stable content id. */
export interface Progress {
	readonly readChapters: ReadonlySet<string>;
	readonly solvedProblems: ReadonlySet<string>;
	/** Problems with a Submission but not yet Solved. */
	readonly attemptedProblems: ReadonlySet<string>;
	/** The Topic the Learner was last active in, if any. */
	readonly recentTopicId?: string;
}

export type TopicState = 'locked' | 'unlocked' | 'complete';

/** One Topic as the Map shows it. */
export interface MapTopic {
	readonly id: string;
	readonly title: string;
	readonly state: TopicState;
	/** Prerequisite Topic ids. */
	readonly prerequisites: readonly string[];
	/** Core Problems Solved. Extra Problems never count. */
	readonly coreSolved: number;
	readonly coreTotal: number;
}

export interface MapView {
	/** In content order. */
	readonly topics: readonly MapTopic[];
	/** The Topic with the most recent activity; undefined when there is none. */
	readonly currentTopicId?: string;
}

/**
 * The Topic Map for one Learner. Pure: Unlocked, Locked and Complete are derived from
 * Progress, never stored (docs/module-map.md).
 */
export function mapView(
	catalogue: Pick<Catalogue, 'topicMap' | 'topic'>,
	progress: Progress
): MapView {
	const summaries = catalogue.topicMap();
	const complete = new Set<string>();
	const counts = new Map<string, { coreSolved: number; coreTotal: number }>();

	for (const { id } of summaries) {
		const topic = catalogue.topic(id);
		const mainLine = topic?.mainLine ?? [];
		const coreSolved = mainLine.filter((p) => progress.solvedProblems.has(p)).length;
		counts.set(id, { coreSolved, coreTotal: mainLine.length });
		const allRead = (topic?.chapters ?? []).every((c) => progress.readChapters.has(c.id));
		if (allRead && coreSolved === mainLine.length) complete.add(id);
	}

	const topics = summaries.map(({ id, title, prerequisites }): MapTopic => {
		const state: TopicState = complete.has(id)
			? 'complete'
			: prerequisites.every((p) => complete.has(p))
				? 'unlocked'
				: 'locked';
		return {
			id,
			title,
			state,
			prerequisites,
			...(counts.get(id) ?? { coreSolved: 0, coreTotal: 0 })
		};
	});

	return { topics, currentTopicId: progress.recentTopicId };
}

export type ProblemStatus = 'Solved' | 'Attempted' | 'Untouched';

export interface TopicProblem {
	readonly id: string;
	readonly title: string;
	readonly kind: 'Core' | 'Extra';
	/** For an Extra Problem: the Core Problem it branches off. */
	readonly parentProblemId?: string;
	readonly status: ProblemStatus;
}

export interface TopicChapter {
	readonly id: string;
	readonly title: string;
	readonly read: boolean;
	readonly problems: readonly TopicProblem[];
}

/** One Unlocked or Complete Topic: Chapters and Problems in content order. No Tests, Hints, Solutions or Reference Code. */
export interface TopicView {
	readonly id: string;
	readonly title: string;
	readonly state: Exclude<TopicState, 'locked'>;
	readonly chapters: readonly TopicChapter[];
	readonly counts: {
		readonly chaptersRead: number;
		readonly chaptersTotal: number;
		readonly coreSolved: number;
		readonly coreTotal: number;
		readonly extraSolved: number;
		readonly extraTotal: number;
	};
}

/**
 * One Topic for one Learner. Pure. Throws NotFound for an unknown id and TopicLocked while
 * a Prerequisite is not Complete.
 */
export function topicView(
	catalogue: Pick<Catalogue, 'topicMap' | 'topic'>,
	progress: Progress,
	topicId: string
): TopicView {
	const topic = catalogue.topic(topicId);
	const mapTopic = mapView(catalogue, progress).topics.find((t) => t.id === topicId);
	if (!topic || !mapTopic) throw new LearningError('NotFound');
	if (mapTopic.state === 'locked') throw new LearningError('TopicLocked');

	const chapters = topic.chapters.map(
		(c): TopicChapter => ({
			id: c.id,
			title: c.title,
			read: progress.readChapters.has(c.id),
			problems: c.problems.map(
				(p): TopicProblem => ({
					id: p.id,
					title: p.title,
					kind: p.kind === 'core' ? 'Core' : 'Extra',
					...(p.parent !== undefined && { parentProblemId: p.parent }),
					status: progress.solvedProblems.has(p.id)
						? 'Solved'
						: progress.attemptedProblems.has(p.id)
							? 'Attempted'
							: 'Untouched'
				})
			)
		})
	);
	const problems = chapters.flatMap((c) => c.problems);
	const count = (kind: TopicProblem['kind'], solvedOnly: boolean) =>
		problems.filter((p) => p.kind === kind && (!solvedOnly || p.status === 'Solved')).length;

	return {
		id: topic.id,
		title: topic.title,
		state: mapTopic.state,
		chapters,
		counts: {
			chaptersRead: chapters.filter((c) => c.read).length,
			chaptersTotal: chapters.length,
			coreSolved: count('Core', true),
			coreTotal: count('Core', false),
			extraSolved: count('Extra', true),
			extraTotal: count('Extra', false)
		}
	};
}

export interface ChapterView {
	readonly id: string;
	readonly title: string;
	readonly topicId: string;
	readonly topicTitle: string;
	/** The Chapter prose rendered to HTML. */
	readonly bodyHtml: string;
	readonly read: boolean;
	/** This Chapter's Problems, in content order. */
	readonly problems: readonly TopicProblem[];
	/** The next Chapter in the same Topic, if there is one. */
	readonly nextChapterId?: string;
}

type ChapterCatalogue = Pick<Catalogue, 'topicMap' | 'topic' | 'chapter'>;

/**
 * One Chapter for one Learner. Pure. Throws NotFound for an unknown id and TopicLocked
 * while its Topic is Locked.
 */
export function chapterView(
	catalogue: ChapterCatalogue,
	progress: Progress,
	chapterId: string,
	renderMarkdown: (markdown: string) => string
): ChapterView {
	const chapter = catalogue.chapter(chapterId);
	if (!chapter) throw new LearningError('NotFound');
	const topic = topicView(catalogue, progress, chapter.topicId);
	const index = topic.chapters.findIndex((c) => c.id === chapterId);
	const own = topic.chapters[index] as TopicChapter; // the catalogue puts every Chapter in its Topic
	const next = topic.chapters[index + 1];
	return {
		id: chapter.id,
		title: chapter.title,
		topicId: topic.id,
		topicTitle: topic.title,
		bodyHtml: renderMarkdown(chapter.body),
		read: own.read,
		problems: own.problems,
		...(next && { nextChapterId: next.id })
	};
}

/** What reaching a Chapter's end changed. */
export interface ProgressChange {
	readonly read: true;
	/** This read finished the Topic. */
	readonly topicCompleted: boolean;
	/** Topics this read Unlocked. */
	readonly newlyUnlocked: readonly { readonly id: string; readonly title: string }[];
}

/**
 * The effect of a Learner reaching the end of a Chapter. Pure: compares the Map before and
 * after. Reading an already Read Chapter changes nothing. Throws NotFound or TopicLocked.
 */
export function reachChapter(
	catalogue: ChapterCatalogue,
	before: Progress,
	chapterId: string
): ProgressChange {
	const chapter = catalogue.chapter(chapterId);
	if (!chapter) throw new LearningError('NotFound');
	topicView(catalogue, before, chapter.topicId); // NotFound / TopicLocked
	if (before.readChapters.has(chapterId)) {
		return { read: true, topicCompleted: false, newlyUnlocked: [] };
	}
	const after: Progress = {
		...before,
		readChapters: new Set([...before.readChapters, chapterId]),
		recentTopicId: chapter.topicId
	};
	const stateBefore = new Map(mapView(catalogue, before).topics.map((t) => [t.id, t.state]));
	const topicsAfter = mapView(catalogue, after).topics;
	return {
		read: true,
		topicCompleted: topicsAfter.some((t) => t.id === chapter.topicId && t.state === 'complete'),
		newlyUnlocked: topicsAfter
			.filter((t) => stateBefore.get(t.id) === 'locked' && t.state !== 'locked')
			.map(({ id, title }) => ({ id, title }))
	};
}

/** The entry file of a Build that has not been started, by Language. */
const ENTRY_FILE: Record<Language, string> = {
	python: 'main.py',
	typescript: 'main.ts',
	go: 'main.go'
};

/** A Problem as the Problem screen needs it. Never carries Hints, a Solution or Hidden Tests. */
export interface ProblemView {
	readonly id: string;
	readonly title: string;
	readonly topicId: string;
	readonly topicTitle: string;
	readonly kind: 'Core' | 'Extra';
	/** For an Extra Problem: the Core Problem it branches off. */
	readonly parentProblemId?: string;
	readonly statementHtml: string;
	readonly exampleTests: readonly { name: string; input: string; expected: string }[];
	readonly language: Language;
	/** The Learner's code: stored if saved, otherwise what the step would start from. */
	readonly files: BuildFiles;
	/** 0 until the step is first saved. */
	readonly revision: number;
	readonly status: ProblemStatus;
}

/** Code the Learner has stored for a step. */
export interface SavedStep {
	readonly files: BuildFiles;
	readonly revision: number;
}

type ProblemCatalogue = Pick<Catalogue, 'topicMap' | 'topic' | 'chapter' | 'problem'>;

/**
 * The Problem whose Build a step starts from: the previous Core Problem on the Main Line, or
 * for an Extra its parent Core Problem. None for a Topic's first Problem (an empty Build).
 */
export function seedSourceOf(
	catalogue: Pick<Catalogue, 'topic' | 'problem'>,
	problemId: string
): string | undefined {
	const problem = catalogue.problem(problemId);
	if (!problem) throw new LearningError('NotFound');
	if (problem.kind === 'extra') return problem.parent;
	const mainLine = catalogue.topic(problem.topicId)?.mainLine ?? [];
	return mainLine[mainLine.indexOf(problemId) - 1];
}

/**
 * One Problem for one Learner. Pure. `own` is the step's stored code and `source` the stored
 * code of the step it seeds from. An unsaved step shows its starting code without writing it:
 * the source's saved code, else the Reference Code after the source, else an empty Build.
 */
export function problemView(
	catalogue: ProblemCatalogue,
	progress: Progress,
	problemId: string,
	language: Language,
	saved: { own?: SavedStep; source?: SavedStep },
	renderMarkdown: (markdown: string) => string
): ProblemView {
	const problem = catalogue.problem(problemId);
	if (!problem) throw new LearningError('NotFound');
	const topic = topicView(catalogue, progress, problem.topicId); // NotFound / TopicLocked
	const listed = topic.chapters.flatMap((c) => c.problems).find((p) => p.id === problemId);
	const sourceId = seedSourceOf(catalogue, problemId);
	const start: BuildFiles = sourceId
		? (saved.source?.files ?? catalogue.problem(sourceId)?.referenceCode[language] ?? {})
		: { [ENTRY_FILE[language]]: '' };
	return {
		id: problem.id,
		title: problem.title,
		topicId: topic.id,
		topicTitle: topic.title,
		kind: problem.kind === 'core' ? 'Core' : 'Extra',
		...(problem.parent !== undefined && { parentProblemId: problem.parent }),
		statementHtml: renderMarkdown(problem.statement),
		exampleTests: problem.exampleTests.map((t) => ({
			name: t.id.slice(t.id.lastIndexOf('/') + 1),
			input: t.input,
			expected: t.expected
		})),
		language,
		files: saved.own?.files ?? start,
		revision: saved.own?.revision ?? 0,
		status: listed?.status ?? 'Untouched'
	};
}

/** The most code one Build may hold, in UTF-8 bytes of paths and contents together. */
export const MAX_BUILD_BYTES = 256 * 1024;

/** Checks a Build the Learner sends: relative `/`-separated paths with no `..`, within the size limit. */
export function validateBuild(files: Readonly<Record<string, unknown>>): BuildFiles {
	const encoder = new TextEncoder();
	let bytes = 0;
	const paths = Object.keys(files);
	if (paths.length === 0) throw new LearningError('InvalidBuild');
	for (const path of paths) {
		const content = files[path];
		const segments = path.split('/');
		if (
			typeof content !== 'string' ||
			path.includes('\\') ||
			path.startsWith('/') ||
			segments.some((s) => s === '' || s === '.' || s === '..')
		) {
			throw new LearningError('InvalidBuild');
		}
		bytes += encoder.encode(path).length + encoder.encode(content).length;
	}
	if (bytes > MAX_BUILD_BYTES) throw new LearningError('InvalidBuild');
	return files as BuildFiles;
}

export type RunTestStatus = 'passed' | 'wrongAnswer' | 'runtimeError' | 'timeout';

/** One Example Test after a Run: visible content, so input, expected and actual are all shown. */
export interface RunTestView {
	readonly name: string;
	readonly input: string;
	readonly expected: string;
	readonly actual: string;
	readonly stderr: string;
	readonly passed: boolean;
	readonly status: RunTestStatus;
}

/** The outcome of Run: the revision it saved and one row per Example Test, or a compile error. */
export interface RunView {
	readonly revision: number;
	readonly compileError?: string;
	readonly tests: readonly RunTestView[];
}

/** Outputs match when equal after \r\n becomes \n, each line loses trailing whitespace and trailing newlines go. */
export function normaliseOutput(output: string): string {
	return output
		.replace(/\r\n/g, '\n')
		.replace(/[^\S\n]+$/gm, '')
		.replace(/\n+$/, '');
}

/**
 * Compares the Runner's raw results with the expected outputs. A runtime error or timeout
 * wins over the comparison. A Runner answer that misses a Test is a failed Runner.
 */
export function runView(
	tests: readonly { id: string; input: string; expected: string }[],
	result: ExecuteResult,
	revision: number
): RunView {
	if (result.compileError !== undefined) {
		return { revision, compileError: result.compileError, tests: [] };
	}
	return {
		revision,
		tests: tests.map((test) => {
			const raw = result.results.find((r) => r.id === test.id);
			if (!raw) throw new LearningError('RunnerUnavailable');
			const status: RunTestStatus =
				raw.status === 'ok'
					? normaliseOutput(raw.stdout) === normaliseOutput(test.expected)
						? 'passed'
						: 'wrongAnswer'
					: raw.status;
			return {
				name: test.id.slice(test.id.lastIndexOf('/') + 1),
				input: test.input,
				expected: test.expected,
				actual: raw.stdout,
				stderr: raw.stderr,
				passed: status === 'passed',
				status
			};
		})
	};
}

export type Verdict =
	| 'Accepted'
	| 'Wrong Answer'
	| 'Runtime Error'
	| 'Time Limit Exceeded'
	| 'Compile Error';

/** Worst first: the Verdict of a Submission is the first of these any Test produced. */
const VERDICT_PRECEDENCE: readonly Exclude<Verdict, 'Accepted'>[] = [
	'Compile Error',
	'Time Limit Exceeded',
	'Runtime Error',
	'Wrong Answer'
];

/** One Test of a Submission, with what only the server may know. */
export interface SubmitTest {
	readonly id: string;
	readonly input: string;
	readonly expected: string;
	/** The Problem this Test belongs to. */
	readonly problemId: string;
	readonly kind: 'example' | 'hidden';
}

/**
 * Why a Submission was not Accepted, as much as the Learner may see: an Example Test of this
 * Problem shows everything, a Hidden Test only that it failed, an earlier step only which one.
 */
export type SubmitFailure =
	| { readonly kind: 'compile'; readonly message: string }
	| {
			readonly kind: 'example';
			readonly name: string;
			readonly input: string;
			readonly expected: string;
			readonly actual: string;
			readonly stderr: string;
	  }
	| { readonly kind: 'hidden'; readonly problemId: string }
	| { readonly kind: 'earlierStep'; readonly problemId: string; readonly problemTitle: string };

/** The outcome of Submit as the browser sees it. */
export interface SubmitView {
	readonly submissionId: string;
	readonly verdict: Verdict;
	readonly failure?: SubmitFailure;
	readonly revision: number;
	/** The Problem's status once this Submission is recorded. */
	readonly status: 'Attempted' | 'Solved';
}

type SubmitCatalogue = Pick<Catalogue, 'topic' | 'problem' | 'hiddenTests'>;

/**
 * Every Test a Submission runs. A Core Problem runs every earlier Core Problem's Tests then its
 * own; an Extra runs the Core Problems up to and including its parent, then its own. All Example
 * Tests come before all Hidden Tests, so no Example output is produced once learner code has
 * seen a Hidden input. Throws NotFound for an unknown Problem.
 */
export function submitTests(catalogue: SubmitCatalogue, problemId: string): SubmitTest[] {
	const problem = catalogue.problem(problemId);
	if (!problem) throw new LearningError('NotFound');
	const mainLine = catalogue.topic(problem.topicId)?.mainLine ?? [];
	const anchor = problem.kind === 'extra' ? (problem.parent ?? problemId) : problemId;
	const scope = mainLine.slice(0, mainLine.indexOf(anchor) + 1);
	if (problem.kind === 'extra') scope.push(problemId);
	const pick = (kind: SubmitTest['kind']) =>
		scope.flatMap((id) => {
			const tests =
				kind === 'example' ? catalogue.problem(id)?.exampleTests : catalogue.hiddenTests(id);
			return (tests ?? []).map(
				({ id: testId, input, expected }): SubmitTest => ({
					id: testId,
					input,
					expected,
					problemId: id,
					kind
				})
			);
		});
	return [...pick('example'), ...pick('hidden')];
}

/**
 * Picks the Verdict from the Runner's raw results. Pure. Compile Error beats Time Limit
 * Exceeded beats Runtime Error beats Wrong Answer beats Accepted; the failure shown is the first
 * Test, in run order, with the winning outcome. A Runner answer that misses a Test is a failed
 * Runner (RunnerUnavailable).
 */
export function judge(
	tests: readonly SubmitTest[],
	result: ExecuteResult,
	problemId: string,
	titleOf: (problemId: string) => string
): { verdict: Verdict; failure?: SubmitFailure; failingProblemId?: string } {
	if (result.compileError !== undefined) {
		return {
			verdict: 'Compile Error',
			failure: { kind: 'compile', message: result.compileError }
		};
	}
	const outcomes = tests.map((test) => {
		const raw = result.results.find((r) => r.id === test.id);
		if (!raw) throw new LearningError('RunnerUnavailable');
		const verdict: Verdict =
			raw.status === 'timeout'
				? 'Time Limit Exceeded'
				: raw.status === 'runtimeError'
					? 'Runtime Error'
					: normaliseOutput(raw.stdout) === normaliseOutput(test.expected)
						? 'Accepted'
						: 'Wrong Answer';
		return { test, raw, verdict };
	});
	for (const verdict of VERDICT_PRECEDENCE) {
		const first = outcomes.find((o) => o.verdict === verdict);
		if (!first) continue;
		const { test, raw } = first;
		const failure: SubmitFailure =
			test.problemId !== problemId
				? { kind: 'earlierStep', problemId: test.problemId, problemTitle: titleOf(test.problemId) }
				: test.kind === 'hidden'
					? { kind: 'hidden', problemId }
					: {
							kind: 'example',
							name: test.id.slice(test.id.lastIndexOf('/') + 1),
							input: test.input,
							expected: test.expected,
							actual: raw.stdout,
							stderr: raw.stderr
						};
		return { verdict, failure, failingProblemId: test.problemId };
	}
	return { verdict: 'Accepted' };
}
