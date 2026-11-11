import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	type Catalogue,
	loadCatalogue,
	type MainLinePlace,
	type Topic,
	type TopicSummary
} from '../content/catalogue.ts';
import { renderMarkdown } from '../markdown.ts';
import { MAX_BUILD_FILES, MAX_PATH_BYTES } from '../runner/port.ts';
import { LearningError } from './errors.ts';
import {
	acceptedDiff,
	chapterView,
	hintsView,
	MAX_BUILD_BYTES,
	mapView,
	normaliseOutput,
	type Progress,
	problemView,
	reachChapter,
	requireOpenTopic,
	runView,
	solutionView,
	topicView,
	validateBuild
} from './rules.ts';

/** A Topic with the given Prerequisites, its Chapters and its Core Problems (the Main Line). */
function topic(
	id: string,
	prerequisites: string[],
	{ chapters = ['c'], core = ['p'] } = {}
): Topic {
	return {
		id,
		title: id.toUpperCase(),
		summary: '',
		prerequisites,
		chapters: chapters.map((c) => ({ id: `${id}-${c}`, title: c, problems: [] })),
		mainLine: core.map((p) => `${id}-${p}`)
	};
}

/** What the catalogue works out for a Problem: its anchor, the Core Problems before it, the one after. */
function placeOf(
	mainLine: readonly string[],
	problemId: string,
	parent?: string
): MainLinePlace | undefined {
	const anchor = parent ?? problemId;
	const at = mainLine.indexOf(anchor);
	if (at < 0) return undefined;
	const next = mainLine[at + 1];
	return { anchor, earlier: mainLine.slice(0, at), ...(next !== undefined && { next }) };
}

function catalogueOf(topics: Topic[]): Pick<Catalogue, 'topicMap' | 'topic' | 'chapter'> {
	const summaries: TopicSummary[] = topics.map(({ id, title, summary, prerequisites }) => ({
		id,
		title,
		summary,
		prerequisites
	}));
	return {
		topicMap: () => summaries,
		topic: (id) => topics.find((t) => t.id === id),
		chapter: (id) => {
			for (const t of topics) {
				const c = t.chapters.find((ch) => ch.id === id);
				if (c) return { ...c, topicId: t.id, body: `# ${c.title}` };
			}
		}
	};
}

const none: Progress = {
	readChapters: new Set(),
	solvedProblems: new Set(),
	attemptedProblems: new Set()
};
const progress = (read: string[], solved: string[], recentTopicId?: string): Progress => ({
	readChapters: new Set(read),
	solvedProblems: new Set(solved),
	attemptedProblems: new Set(),
	recentTopicId
});
const states = (view: ReturnType<typeof mapView>) =>
	Object.fromEntries(view.topics.map((t) => [t.id, t.state]));

describe('Unlock rules', () => {
	const chain = catalogueOf([topic('a', []), topic('b', ['a']), topic('c', ['a', 'b'])]);

	it('unlocks Topics without Prerequisites and locks the rest', () => {
		expect(states(mapView(chain, none))).toEqual({ a: 'unlocked', b: 'locked', c: 'locked' });
	});

	it('keeps a Topic Locked while a Prerequisite is only partly done', () => {
		expect(states(mapView(chain, progress(['a-c'], [])))).toMatchObject({ b: 'locked' });
		expect(states(mapView(chain, progress([], ['a-p'])))).toMatchObject({ b: 'locked' });
	});

	it('unlocks a Topic when its Prerequisite is Complete, and marks that one Complete', () => {
		expect(states(mapView(chain, progress(['a-c'], ['a-p'])))).toEqual({
			a: 'complete',
			b: 'unlocked',
			c: 'locked'
		});
	});

	it('needs every Prerequisite Complete, not just one', () => {
		const view = mapView(chain, progress(['a-c', 'b-c'], ['a-p', 'b-p']));
		expect(states(view)).toEqual({ a: 'complete', b: 'complete', c: 'unlocked' });
		const onlyB = catalogueOf([topic('a', []), topic('x', []), topic('c', ['a', 'x'])]);
		expect(states(mapView(onlyB, progress(['a-c'], ['a-p'])))).toMatchObject({ c: 'locked' });
	});

	it('keeps a Topic Locked while a Prerequisite is not Complete, whatever its partial progress', () => {
		expect(states(mapView(chain, progress(['c-c'], [])))).toMatchObject({
			b: 'locked',
			c: 'locked'
		});
	});

	it('never Locks a Complete Topic, even with an incomplete Prerequisite', () => {
		expect(states(mapView(chain, progress(['b-c'], ['b-p'])))).toMatchObject({
			a: 'unlocked',
			b: 'complete'
		});
	});
});

describe('Complete rule', () => {
	const two = catalogueOf([topic('t', [], { chapters: ['c1', 'c2'], core: ['p1', 'p2'] })]);

	it('needs every Chapter Read and every Core Problem Solved', () => {
		const all = progress(['t-c1', 't-c2'], ['t-p1', 't-p2']);
		expect(states(mapView(two, all)).t).toBe('complete');
		expect(states(mapView(two, progress(['t-c1'], ['t-p1', 't-p2']))).t).toBe('unlocked');
		expect(states(mapView(two, progress(['t-c1', 't-c2'], ['t-p1']))).t).toBe('unlocked');
	});

	it('never counts Extra Problems, solved or not', () => {
		const withExtra = progress(['t-c1', 't-c2'], ['t-p1', 't-p2', 't-extra']);
		expect(states(mapView(two, withExtra)).t).toBe('complete');
		expect(mapView(two, progress([], ['t-extra'])).topics[0]).toMatchObject({
			coreSolved: 0,
			coreTotal: 2
		});
	});
});

describe('map counts and current Topic', () => {
	const cat = catalogueOf([topic('a', [], { core: ['p1', 'p2'] }), topic('b', ['a'])]);

	it('reports id, title, Prerequisites and Core solved counts per Topic', () => {
		expect(mapView(cat, progress([], ['a-p1'])).topics).toEqual([
			{
				id: 'a',
				title: 'A',
				state: 'unlocked',
				prerequisites: [],
				coreSolved: 1,
				coreTotal: 2
			},
			{ id: 'b', title: 'B', state: 'locked', prerequisites: ['a'], coreSolved: 0, coreTotal: 1 }
		]);
	});

	it('has no current Topic without activity, else the most recently active one', () => {
		expect(mapView(cat, none).currentTopicId).toBeUndefined();
		expect(mapView(cat, progress([], [], 'a')).currentTopicId).toBe('a');
	});
});

describe('topicView', () => {
	const t = {
		...topic('a', [], { chapters: ['c1', 'c2'], core: ['p1', 'p2'] }),
		chapters: [
			{
				id: 'a-c1',
				title: 'c1',
				problems: [
					{ id: 'a-p1', title: 'P1', kind: 'core' as const },
					{ id: 'a-x1', title: 'X1', kind: 'extra' as const, parent: 'a-p1' }
				]
			},
			{ id: 'a-c2', title: 'c2', problems: [{ id: 'a-p2', title: 'P2', kind: 'core' as const }] }
		]
	};
	const cat = catalogueOf([t]);

	it('reads Read, Solved and Attempted from Progress and counts them', () => {
		const view = topicView(
			cat,
			{
				...progress(['a-c1'], ['a-p1', 'a-x1']),
				attemptedProblems: new Set(['a-p2'])
			},
			'a'
		);
		expect(view.chapters.map((c) => c.read)).toEqual([true, false]);
		expect(view.chapters.flatMap((c) => c.problems.map((p) => p.status))).toEqual([
			'Solved',
			'Solved',
			'Attempted'
		]);
		expect(view.counts).toEqual({
			chaptersRead: 1,
			chaptersTotal: 2,
			coreSolved: 1,
			coreTotal: 2,
			extraSolved: 1,
			extraTotal: 1
		});
	});

	it('is Complete when every Chapter is read and every Core Problem Solved', () => {
		expect(topicView(cat, progress(['a-c1', 'a-c2'], ['a-p1', 'a-p2']), 'a').state).toBe(
			'complete'
		);
	});

	it('refuses a Locked Topic and an unknown one', () => {
		const both = catalogueOf([topic('a', []), topic('b', ['a'])]);
		expect(() => topicView(both, none, 'b')).toThrow(LearningError);
		expect(() => topicView(both, none, 'zzz')).toThrow(LearningError);
	});
});

describe('requireOpenTopic', () => {
	const cat = catalogueOf([topic('a', []), topic('b', ['a'])]);
	it.each([
		['an unknown Topic', 'zzz', none, 'NotFound'],
		['a Locked Topic', 'b', none, 'TopicLocked'],
		['an Unlocked Topic', 'a', none, undefined],
		['a Complete Topic', 'a', progress(['a-c'], ['a-p']), undefined]
	] as const)('for %s', (_name, topicId, given, error) => {
		if (error) {
			expect(() => requireOpenTopic(cat, given, topicId)).toThrow(
				expect.objectContaining({ code: error })
			);
		} else {
			expect(() => requireOpenTopic(cat, given, topicId)).not.toThrow();
		}
	});
});

describe('reachChapter', () => {
	const cat = catalogueOf([
		topic('a', [], { chapters: ['c1', 'c2'], core: ['p1'] }),
		topic('b', ['a'], { chapters: ['c1'], core: ['p1'] })
	]);

	it('marks a Chapter Read without Completing the Topic while something is left', () => {
		expect(reachChapter(cat, none, 'a-c1')).toEqual({
			read: true,
			topicCompleted: false,
			newlyUnlocked: []
		});
	});

	it('Completes the Topic when the last unread Chapter is read and every Core Problem is Solved, and Unlocks its dependants', () => {
		expect(reachChapter(cat, progress(['a-c1'], ['a-p1']), 'a-c2')).toEqual({
			read: true,
			topicCompleted: true,
			newlyUnlocked: [{ id: 'b', title: 'B' }]
		});
	});

	it('does not Complete the Topic while a Core Problem is unsolved', () => {
		expect(reachChapter(cat, progress(['a-c1'], []), 'a-c2')).toMatchObject({
			topicCompleted: false,
			newlyUnlocked: []
		});
	});

	it('is idempotent: reading an already Read Chapter changes nothing', () => {
		expect(reachChapter(cat, progress(['a-c1', 'a-c2'], ['a-p1']), 'a-c2')).toEqual({
			read: true,
			topicCompleted: false,
			newlyUnlocked: []
		});
	});

	it('refuses a Locked Topic and an unknown Chapter', () => {
		expect(() => reachChapter(cat, none, 'b-c1')).toThrow(LearningError);
		expect(() => reachChapter(cat, none, 'zzz')).toThrow(LearningError);
	});
});

describe('chapterView', () => {
	const t = {
		...topic('a', [], { chapters: ['c1', 'c2'], core: ['p1'] }),
		chapters: [
			{
				id: 'a-c1',
				title: 'c1',
				problems: [
					{ id: 'a-p1', title: 'P1', kind: 'core' as const },
					{ id: 'a-x1', title: 'X1', kind: 'extra' as const, parent: 'a-p1' }
				]
			},
			{ id: 'a-c2', title: 'c2', problems: [] }
		]
	};
	const cat = catalogueOf([t, topic('b', ['a'])]);
	const render = (md: string) => `<rendered>${md}</rendered>`;

	it('gives the Chapter, its rendered body, Read state, Problems and the next Chapter', () => {
		expect(chapterView(cat, progress(['a-c1'], ['a-p1']), 'a-c1', render)).toEqual({
			id: 'a-c1',
			title: 'c1',
			topicId: 'a',
			topicTitle: 'A',
			bodyHtml: '<rendered># c1</rendered>',
			read: true,
			problems: [
				{ id: 'a-p1', title: 'P1', kind: 'Core', status: 'Solved' },
				{ id: 'a-x1', title: 'X1', kind: 'Extra', parentProblemId: 'a-p1', status: 'Untouched' }
			],
			nextChapterId: 'a-c2'
		});
	});

	it('has no next Chapter after the last one in the Topic', () => {
		expect(chapterView(cat, none, 'a-c2', render).nextChapterId).toBeUndefined();
	});

	it('refuses a Locked Topic and an unknown Chapter', () => {
		expect(() => chapterView(cat, none, 'b-c1', render)).toThrow(LearningError);
		expect(() => chapterView(cat, none, 'zzz', render)).toThrow(LearningError);
	});
});

describe('normaliseOutput()', () => {
	it.each([
		['a\r\nb\r\n', 'a\nb'],
		['a  \nb\t\n', 'a\nb'],
		['a\nb\n\n\n', 'a\nb'],
		['  a\n', '  a'],
		['a b', 'a b'],
		['', ''],
		['a\n\nb', 'a\n\nb']
	])('turns %j into %j', (raw, expected) => {
		expect(normaliseOutput(raw)).toBe(expected);
	});
});

describe('runView()', () => {
	const tests = [
		{ id: 'p/example/01', name: '01', input: 'in1', expected: '2\n' },
		{ id: 'p/example/02', name: '02', input: 'in2', expected: '5\n' }
	];
	const ok = (id: string, stdout: string, stderr = '') => ({
		id,
		status: 'ok' as const,
		stdout,
		stderr
	});

	it('passes a Test whose output matches after normalising, fails one that does not', () => {
		const view = runView(
			tests,
			{ results: [ok('p/example/01', '2  \r\n\r\n'), ok('p/example/02', '6\n')] },
			3
		);

		expect(view).toEqual({
			revision: 3,
			tests: [
				{
					name: '01',
					input: 'in1',
					expected: '2\n',
					actual: '2  \r\n\r\n',
					stderr: '',
					passed: true,
					status: 'passed'
				},
				{
					name: '02',
					input: 'in2',
					expected: '5\n',
					actual: '6\n',
					stderr: '',
					passed: false,
					status: 'wrongAnswer'
				}
			]
		});
	});

	it('lets a runtime error or timeout win over a matching output', () => {
		const view = runView(
			tests,
			{
				results: [
					{ id: 'p/example/01', status: 'runtimeError', stdout: '2\n', stderr: 'Traceback' },
					{ id: 'p/example/02', status: 'timeout', stdout: '5\n', stderr: '' }
				]
			},
			1
		);

		expect(view.tests.map((t) => [t.status, t.passed])).toEqual([
			['runtimeError', false],
			['timeout', false]
		]);
		expect(view.tests[0]?.stderr).toBe('Traceback');
	});

	it('reports a compile error with no tests', () => {
		expect(runView(tests, { compileError: 'bad syntax', results: [] }, 2)).toEqual({
			revision: 2,
			compileError: 'bad syntax',
			tests: []
		});
	});

	it('refuses a Runner answer that misses a Test as RunnerUnavailable', () => {
		expect(() => runView(tests, { results: [ok('p/example/01', '2')] }, 1)).toThrow(
			expect.objectContaining({ code: 'RunnerUnavailable' })
		);
	});
});

describe('acceptedDiff()', () => {
	// a: chapter a-c, Core a-p1, a-p2, Extra a-x (parent a-p1). b needs a. c needs a and b.
	const topics = [
		topic('a', [], { core: ['p1', 'p2'] }),
		topic('b', ['a']),
		topic('c', ['a', 'b'])
	];
	const catalogue = {
		...catalogueOf(topics),
		problem: (id: string) => {
			const topicId = id.split('-')[0] ?? '';
			if (id === 'a-x') return { id, topicId, kind: 'extra', parent: 'a-p1' } as never;
			return topics.some((t) => t.mainLine.includes(id))
				? ({ id, topicId, kind: 'core' } as never)
				: undefined;
		},
		mainLinePlace: (id: string) =>
			placeOf(
				topics.find((t) => t.id === id.split('-')[0])?.mainLine ?? [],
				id,
				id === 'a-x' ? 'a-p1' : undefined
			)
	};
	const solvedP1 = progress(['a-c'], ['a-p1']);
	const solvedBoth = progress(['a-c'], ['a-p1', 'a-p2']);

	it.each([
		['a Core Problem mid-Topic: the next Core Problem', none, solvedP1, 'a-p1', 'a-p2', false, []],
		[
			'the last Core Problem: no next, Topic completed, dependants Unlocked',
			solvedP1,
			solvedBoth,
			'a-p2',
			null,
			true,
			[{ id: 'b', title: 'B' }]
		],
		[
			'an Extra: the Core Problem after its parent',
			none,
			progress(['a-c'], ['a-x']),
			'a-x',
			'a-p2',
			false,
			[]
		],
		[
			're-solving a Solved Problem: nothing changes',
			solvedBoth,
			solvedBoth,
			'a-p2',
			null,
			false,
			[]
		],
		[
			'the last Problem while chapters are unread: not Complete',
			none,
			progress([], ['a-p1', 'a-p2']),
			'a-p2',
			null,
			false,
			[]
		],
		[
			'a Topic with two Prerequisites: not listed until both are Complete',
			progress(['a-c'], ['a-p1', 'a-p2']),
			progress(['a-c', 'b-c'], ['a-p1', 'a-p2', 'b-p']),
			'b-p',
			null,
			true,
			[{ id: 'c', title: 'C' }]
		]
	])('%s', (_name, before, after, problemId, nextProblemId, topicCompleted, newlyUnlocked) => {
		expect(acceptedDiff(catalogue, before, after, problemId)).toEqual({
			nextProblemId,
			topicCompleted,
			newlyUnlocked
		});
	});

	it('does not list a dependant that needs another Prerequisite too', () => {
		const diff = acceptedDiff(catalogue, none, solvedBoth, 'a-p2');
		expect(diff.newlyUnlocked.map((t) => t.id)).toEqual(['b']);
	});

	it('throws NotFound for an unknown Problem', () => {
		expect(() => acceptedDiff(catalogue, none, none, 'nope')).toThrow(LearningError);
	});
});

const fixtureDir = fileURLToPath(new URL('../content/fixture', import.meta.url));
// Top-level await: the it.each tables below read the catalogue while they are collected.
const catalogue = await loadCatalogue(fixtureDir);

describe('Fixture rules', () => {
	describe('problemView()', () => {
		const render = (markdown: string) => markdown;
		const step = (files: Record<string, string>, revision = 1) => ({ files, revision });
		const referenceOf = (id: string, language: 'python' | 'typescript' | 'go') =>
			catalogue.problem(id)?.referenceCode[language];
		const notes = (a: string, b: string, c: string) => ({ python: a, typescript: b, go: c });
		const EMPTY = 'starts empty';
		const REFERENCE = 'starts from the reference code for the previous Problem';
		const PREVIOUS = 'starts from your code for the previous Problem';

		it.each([
			[
				'a first step never saved',
				'stacks-push',
				{},
				{ files: { 'main.ts': '' }, revision: 0, notes: notes(EMPTY, EMPTY, EMPTY) }
			],
			[
				'a first step saved',
				'stacks-push',
				{ own: step({ 'main.ts': 'mine' }, 4) },
				{ files: { 'main.ts': 'mine' }, revision: 4, notes: notes(EMPTY, EMPTY, EMPTY) }
			],
			[
				'a later step never saved, seeded from Reference Code',
				'stacks-pop',
				{},
				{
					files: referenceOf('stacks-push', 'typescript'),
					revision: 0,
					notes: notes(REFERENCE, REFERENCE, REFERENCE)
				}
			],
			[
				'a later step never saved, seeded from the previous step',
				'stacks-pop',
				{ source: step({ 'main.ts': 'prev' }), sourceSavedIn: ['typescript' as const] },
				{
					files: { 'main.ts': 'prev' },
					revision: 0,
					notes: notes(REFERENCE, PREVIOUS, REFERENCE)
				}
			],
			[
				'a later step saved',
				'stacks-pop',
				{ own: step({ 'main.ts': 'own' }, 2), source: step({ 'main.ts': 'prev' }) },
				{ files: { 'main.ts': 'own' }, revision: 2, notes: notes(REFERENCE, REFERENCE, REFERENCE) }
			],
			[
				'an Extra never saved, seeded from its parent',
				'stacks-peek',
				{},
				{
					files: referenceOf('stacks-push', 'typescript'),
					revision: 0,
					notes: notes(REFERENCE, REFERENCE, REFERENCE)
				}
			]
		])('starts %s', (_name, problemId, saved, expected) => {
			const view = problemView(catalogue, none, problemId, 'typescript', saved, render);

			expect(view.files).toEqual(expected.files);
			expect(view.build).toEqual({
				problemId,
				language: 'typescript',
				revision: expected.revision
			});
			expect(view.seedNotes).toEqual(expected.notes);
		});
	});
});

describe('validateBuild()', () => {
	it.each([
		['one file', { 'main.py': 'print(1)' }],
		['a nested path', { 'main.py': 'x', 'pkg/util.py': 'y' }],
		['an empty file', { 'main.py': '' }],
		[
			'a Build exactly at the size limit',
			{ 'main.py': 'x'.repeat(MAX_BUILD_BYTES - 'main.py'.length) }
		]
	])('accepts %s', (_name, files) => {
		expect(validateBuild(files)).toEqual(files);
	});

	it.each([
		['no file', {}],
		['a Build over the size limit', { 'main.py': 'x'.repeat(MAX_BUILD_BYTES) }],
		['a size counted in UTF-8 bytes', { 'main.py': 'é'.repeat(MAX_BUILD_BYTES / 2) }],
		['an absolute path', { '/main.py': 'x' }],
		['a dot segment', { 'a/./b.py': 'x' }],
		['an empty segment', { 'a//b.py': 'x' }],
		['a path with a NUL', { 'a\0b.py': 'x' }],
		['a path that is not well-formed Unicode', { '\uD800.py': 'x' }],
		['a path over the byte limit', { [`${'a'.repeat(MAX_PATH_BYTES)}.py`]: 'x' }],
		[
			'too many files',
			Object.fromEntries(Array.from({ length: MAX_BUILD_FILES + 1 }, (_, i) => [`f${i}.py`, '']))
		],
		['a path with ..', { '../main.py': 'x' }],
		['a path with a backslash', { 'a\\b.py': 'x' }],
		['an empty path', { '': 'x' }],
		['a path that is a directory of another', { a: 'x', 'a/b': 'y' }],
		['a content that is not a string', { 'main.py': 42 }],
		['a null content', { 'main.py': null }]
	])('refuses %s', (_name, files) => {
		expect(() => validateBuild(files)).toThrow(expect.objectContaining({ code: 'InvalidBuild' }));
	});
});

describe('a leading h1 that repeats the page title', () => {
	const problemId = 'stacks-push';
	const chapterId = 'stacks-undo-log';
	const title = catalogue.problem(problemId)?.title as string;
	const chapterTitle = catalogue.chapter(chapterId)?.title as string;
	const withHeadings = {
		...catalogue,
		chapter: (id: string) => {
			const c = catalogue.chapter(id);
			return c && { ...c, body: `# ${c.title}\n\nChapter text` };
		},
		problem: (id: string) => {
			const p = catalogue.problem(id);
			return (
				p && {
					...p,
					statement: `# ${p.title}\n\nStatement text`,
					hints: [`# ${p.title}\n\nHint text`],
					solution: `# ${p.title}\n\nSolution text`
				}
			);
		}
	};

	it('is dropped from the Chapter body', () => {
		const view = chapterView(withHeadings, none, chapterId, renderMarkdown);
		expect(view.bodyHtml).toBe('<p>Chapter text</p>\n');
		expect(view.title).toBe(chapterTitle);
	});

	it('is dropped from the Problem statement', () => {
		const view = problemView(withHeadings, none, problemId, 'typescript', {}, renderMarkdown);
		expect(view.statementHtml).toBe('<p>Statement text</p>\n');
	});

	it('is kept in a Hint and in the Solution', () => {
		const hints = hintsView(withHeadings, none, problemId, 1, renderMarkdown);
		expect(hints.revealed[0].html).toBe(`<h1>${title}</h1>\n<p>Hint text</p>\n`);
		const solution = solutionView(withHeadings, none, problemId, renderMarkdown);
		expect(solution.explanationHtml).toBe(`<h1>${title}</h1>\n<p>Solution text</p>\n`);
	});
});
