import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
import { createScriptedRunner, type RunnerScript } from '../runner/fake.ts';
import { createTestDb } from '../test-db.ts';
import { createLearningCore, LearningError } from './core.ts';

const fixtureDir = fileURLToPath(new URL('../content/fixture', import.meta.url));

describe('learner.map()', () => {
	it('shows a new Learner the fixture Topic Map: no-Prerequisite Topics Unlocked, the rest Locked, 0 Core solved', async () => {
		const core = createLearningCore({
			catalogue: await loadCatalogue(fixtureDir),
			db: await createTestDb()
		});

		const map = await core.forLearner('any-learner').map();

		expect(map.topics).toEqual([
			{
				id: 'stacks',
				title: 'Stacks',
				state: 'unlocked',
				prerequisites: [],
				coreSolved: 0,
				coreTotal: 2
			},
			{
				id: 'queues',
				title: 'Queues',
				state: 'locked',
				prerequisites: ['stacks'],
				coreSolved: 0,
				coreTotal: 1
			},
			{
				id: 'heaps',
				title: 'Heaps',
				state: 'locked',
				prerequisites: ['stacks', 'queues'],
				coreSolved: 0,
				coreTotal: 1
			}
		]);
		expect(map.currentTopicId).toBeUndefined();
	});
});

describe('learner.topic()', () => {
	async function learner() {
		const core = createLearningCore({
			catalogue: await loadCatalogue(fixtureDir),
			db: await createTestDb()
		});
		return core.forLearner('any-learner');
	}

	it('gives an Unlocked Topic its Chapters and Problems in content order, all not read and Untouched', async () => {
		const view = await (await learner()).topic('stacks');

		expect(view).toEqual({
			id: 'stacks',
			title: 'Stacks',
			state: 'unlocked',
			chapters: [
				{
					id: 'stacks-undo-log',
					title: 'An undo log',
					read: false,
					problems: [
						{ id: 'stacks-push', title: 'Push and size', kind: 'Core', status: 'Untouched' },
						{
							id: 'stacks-peek',
							title: 'Peek',
							kind: 'Extra',
							parentProblemId: 'stacks-push',
							status: 'Untouched'
						}
					]
				},
				{
					id: 'stacks-call-frames',
					title: 'Call frames',
					read: false,
					problems: [{ id: 'stacks-pop', title: 'Pop', kind: 'Core', status: 'Untouched' }]
				}
			],
			counts: {
				chaptersRead: 0,
				chaptersTotal: 2,
				coreSolved: 0,
				coreTotal: 2,
				extraSolved: 0,
				extraTotal: 1
			}
		});
	});

	it('carries no Tests, Hints, Solutions or Reference Code', async () => {
		const json = JSON.stringify(await (await learner()).topic('stacks'));
		for (const leak of ['statement', 'hint', 'solution', 'reference', 'expected', 'hidden']) {
			expect(json).not.toContain(leak);
		}
	});

	it('throws NotFound for an unknown Topic', async () => {
		await expect((await learner()).topic('nope')).rejects.toMatchObject({ code: 'NotFound' });
		await expect((await learner()).topic('nope')).rejects.toBeInstanceOf(LearningError);
	});

	it('throws TopicLocked for a Locked Topic', async () => {
		await expect((await learner()).topic('queues')).rejects.toMatchObject({
			code: 'TopicLocked'
		});
	});
});

describe('learner.chapter() and learner.reachChapterEnd()', () => {
	async function setup(clock?: () => Date) {
		const core = createLearningCore({
			catalogue: await loadCatalogue(fixtureDir),
			db: await createTestDb(),
			clock
		});
		return { learner: core.forLearner('any-learner'), core };
	}

	it('gives a Chapter its rendered body, Topic, Problems and next Chapter', async () => {
		const { learner } = await setup();

		expect(await learner.chapter('stacks-undo-log')).toEqual({
			id: 'stacks-undo-log',
			title: 'An undo log',
			topicId: 'stacks',
			topicTitle: 'Stacks',
			bodyHtml: expect.stringContaining('<h1>An undo log</h1>'),
			read: false,
			problems: [
				{ id: 'stacks-push', title: 'Push and size', kind: 'Core', status: 'Untouched' },
				{
					id: 'stacks-peek',
					title: 'Peek',
					kind: 'Extra',
					parentProblemId: 'stacks-push',
					status: 'Untouched'
				}
			],
			nextChapterId: 'stacks-call-frames'
		});
		expect((await learner.chapter('stacks-call-frames')).nextChapterId).toBeUndefined();
	});

	it('refuses an unknown Chapter and a Chapter in a Locked Topic', async () => {
		const { learner } = await setup();
		await expect(learner.chapter('nope')).rejects.toMatchObject({ code: 'NotFound' });
		await expect(learner.chapter('queues-print-spooler')).rejects.toMatchObject({
			code: 'TopicLocked'
		});
		await expect(learner.reachChapterEnd('nope')).rejects.toMatchObject({ code: 'NotFound' });
		await expect(learner.reachChapterEnd('queues-print-spooler')).rejects.toMatchObject({
			code: 'TopicLocked'
		});
	});

	it('marks a Chapter Read on reaching its end, and the Topic shows it', async () => {
		const { learner } = await setup();

		expect(await learner.reachChapterEnd('stacks-undo-log')).toEqual({
			read: true,
			topicCompleted: false,
			newlyUnlocked: []
		});

		expect((await learner.chapter('stacks-undo-log')).read).toBe(true);
		const topic = await learner.topic('stacks');
		expect(topic.chapters.map((c) => c.read)).toEqual([true, false]);
		expect(topic.counts.chaptersRead).toBe(1);
	});

	it('is idempotent: a repeat changes nothing and keeps the first read time', async () => {
		let t = 1;
		const { learner, core } = await setup(() => new Date(t++ * 1000));
		await learner.reachChapterEnd('stacks-undo-log');
		await learner.reachChapterEnd('stacks-call-frames');

		expect(await learner.reachChapterEnd('stacks-undo-log')).toEqual({
			read: true,
			topicCompleted: false,
			newlyUnlocked: []
		});
		expect((await learner.topic('stacks')).counts.chaptersRead).toBe(2);
		// The repeat did not make stacks-undo-log the most recent read.
		expect((await core.forLearner('any-learner').map()).currentTopicId).toBe('stacks');
	});

	it('survives two concurrent reads of the same Chapter', async () => {
		const { learner } = await setup();
		await Promise.all([
			learner.reachChapterEnd('stacks-undo-log'),
			learner.reachChapterEnd('stacks-undo-log')
		]);
		expect((await learner.topic('stacks')).counts.chaptersRead).toBe(1);
	});

	it("keeps each Learner's Read marks to themselves", async () => {
		const { learner, core } = await setup();
		await learner.reachChapterEnd('stacks-undo-log');
		expect((await core.forLearner('someone-else').chapter('stacks-undo-log')).read).toBe(false);
	});

	it('makes the Topic of the most recent Chapter read the Map current Topic', async () => {
		const { learner } = await setup();
		expect((await learner.map()).currentTopicId).toBeUndefined();
		await learner.reachChapterEnd('stacks-undo-log');
		expect((await learner.map()).currentTopicId).toBe('stacks');
	});
});

describe('learner.problem() and learner.saveCode()', () => {
	async function setup() {
		const catalogue = await loadCatalogue(fixtureDir);
		const core = createLearningCore({ catalogue, db: await createTestDb() });
		return { catalogue, core, learner: core.forLearner('any-learner') };
	}

	it('gives the first Problem of a Topic an empty Build with one entry file, revision 0', async () => {
		const { learner } = await setup();

		expect(await learner.problem('stacks-push')).toEqual({
			id: 'stacks-push',
			title: 'Push and size',
			topicId: 'stacks',
			topicTitle: 'Stacks',
			kind: 'Core',
			statementHtml: expect.stringContaining('Add'),
			exampleTests: [{ name: '01', input: 'push 1\npush 2\nsize\n', expected: '2\n' }],
			language: 'python',
			files: { 'main.py': '' },
			revision: 0,
			status: 'Untouched'
		});
	});

	it('starts a Core Problem from the Reference Code after the previous Core Problem when nothing was saved', async () => {
		const { learner, catalogue } = await setup();

		const view = await learner.problem('stacks-pop');

		expect(view.files).toEqual(catalogue.problem('stacks-push')?.referenceCode.python);
		expect(view.revision).toBe(0);
	});

	it("starts a Core Problem from the Learner's latest saved code for the previous Core Problem", async () => {
		const { learner } = await setup();
		await learner.saveCode('stacks-push', { 'main.py': 'mine v1' }, 0, 'python');
		await learner.saveCode('stacks-push', { 'main.py': 'mine v2', 'util.py': 'x' }, 1, 'python');

		expect((await learner.problem('stacks-pop')).files).toEqual({
			'main.py': 'mine v2',
			'util.py': 'x'
		});
	});

	it('starts an Extra Problem from its parent Core step, saved code first, else Reference Code', async () => {
		const { learner, catalogue } = await setup();
		expect((await learner.problem('stacks-peek')).files).toEqual(
			catalogue.problem('stacks-push')?.referenceCode.python
		);

		await learner.saveCode('stacks-push', { 'main.py': 'parent code' }, 0, 'python');
		expect((await learner.problem('stacks-peek')).files).toEqual({ 'main.py': 'parent code' });
	});

	it('copies a step once: once saved, later changes to its source never change it', async () => {
		const { learner } = await setup();
		const seeded = (await learner.problem('stacks-pop')).files;
		await learner.saveCode('stacks-pop', seeded, 0, 'python');

		await learner.saveCode('stacks-push', { 'main.py': 'edited after' }, 0, 'python');

		expect((await learner.problem('stacks-pop')).files).toEqual(seeded);
	});

	it('saves code, returns the new revision and shows it again, per Learner', async () => {
		const { learner, core } = await setup();

		expect(await learner.saveCode('stacks-push', { 'main.py': 'a' }, 0, 'python')).toEqual({
			revision: 1
		});
		expect(await learner.saveCode('stacks-push', { 'main.py': 'ab' }, 1, 'python')).toEqual({
			revision: 2
		});

		const view = await learner.problem('stacks-push');
		expect(view.files).toEqual({ 'main.py': 'ab' });
		expect(view.revision).toBe(2);
		const other = await core.forLearner('someone-else').problem('stacks-push');
		expect(other).toMatchObject({ files: { 'main.py': '' }, revision: 0 });
	});

	it('returns RevisionConflict for a stale revision and keeps the stored code', async () => {
		const { learner } = await setup();
		await learner.saveCode('stacks-push', { 'main.py': 'tab one' }, 0, 'python');

		await expect(
			learner.saveCode('stacks-push', { 'main.py': 'tab two' }, 0, 'python')
		).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		await expect(
			learner.saveCode('stacks-push', { 'main.py': 'tab two' }, 5, 'python')
		).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.py': 'tab one' });
	});

	it('lets only one of two concurrent first saves win', async () => {
		const { learner } = await setup();
		const results = await Promise.allSettled([
			learner.saveCode('stacks-push', { 'main.py': 'a' }, 0, 'python'),
			learner.saveCode('stacks-push', { 'main.py': 'b' }, 0, 'python')
		]);
		expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
	});

	it.each([
		['an absolute path', { '/etc/passwd': 'x' }],
		['a parent path', { '../x.py': 'x' }],
		['a nested parent path', { 'a/../../x.py': 'x' }],
		['a backslash path', { 'a\\b.py': 'x' }],
		['an empty path', { '': 'x' }],
		['no files', {}],
		['too much code', { 'main.py': 'x'.repeat(256 * 1024 + 1) }]
	])('refuses %s as InvalidBuild and stores nothing', async (_name, files) => {
		const { learner } = await setup();
		await expect(learner.saveCode('stacks-push', files, 0, 'python')).rejects.toMatchObject({
			code: 'InvalidBuild'
		});
		expect((await learner.problem('stacks-push')).revision).toBe(0);
	});

	it('accepts nested relative paths and code right at the limit', async () => {
		const { learner } = await setup();
		await expect(
			learner.saveCode(
				'stacks-push',
				{ 'pkg/util.py': 'x'.repeat(256 * 1024 - 'pkg/util.py'.length) },
				0,
				'python'
			)
		).resolves.toEqual({ revision: 1 });
	});

	it('refuses an unknown Problem and one in a Locked Topic', async () => {
		const { learner } = await setup();
		await expect(learner.problem('nope')).rejects.toMatchObject({ code: 'NotFound' });
		await expect(learner.problem('queues-enqueue')).rejects.toMatchObject({ code: 'TopicLocked' });
		await expect(learner.saveCode('nope', { 'main.py': '' }, 0, 'python')).rejects.toMatchObject({
			code: 'NotFound'
		});
	});

	it('never sends Hints, the Solution or Hidden Tests to the browser', async () => {
		const { learner, catalogue } = await setup();
		const json = JSON.stringify(await learner.problem('stacks-push'));
		const problem = catalogue.problem('stacks-push');
		expect(problem?.hints.length).toBeGreaterThan(0);
		for (const hint of problem?.hints ?? []) expect(json).not.toContain(hint.trim());
		expect(json).not.toContain('solution');
		for (const t of catalogue.hiddenTests('stacks-push') ?? []) {
			expect(json).not.toContain(JSON.stringify(t.input));
			expect(json).not.toContain(JSON.stringify(t.expected));
		}
		expect(json).not.toContain('hidden');
		expect(json).not.toContain('hint');
	});
});

describe('learner.run()', () => {
	const exampleId = 'stacks-push/example/01';
	async function setup(script: RunnerScript = {}) {
		const runner = createScriptedRunner(script);
		const db = await createTestDb();
		const core = createLearningCore({
			catalogue: await loadCatalogue(fixtureDir),
			db,
			runner
		});
		return { runner, db, learner: core.forLearner('any-learner') };
	}

	it('saves the Build, sends only the Example Test ids and inputs with the files, and compares', async () => {
		const { runner, learner } = await setup({
			tests: { [exampleId]: { status: 'ok', stdout: '2\n' } }
		});

		const view = await learner.run('stacks-push', { 'main.py': 'print(2)' }, 0, 'python');

		expect(view).toEqual({
			revision: 1,
			tests: [
				{
					name: '01',
					input: 'push 1\npush 2\nsize\n',
					expected: '2\n',
					actual: '2\n',
					stderr: '',
					passed: true,
					status: 'passed'
				}
			]
		});
		expect(await learner.problem('stacks-push')).toMatchObject({
			files: { 'main.py': 'print(2)' },
			revision: 1
		});
		expect(runner.calls).toHaveLength(1);
		expect(runner.calls[0]).toMatchObject({
			language: 'python',
			files: { 'main.py': 'print(2)' },
			tests: [{ id: exampleId, input: 'push 1\npush 2\nsize\n' }]
		});
		expect(JSON.stringify(runner.calls)).not.toContain('hidden');
		expect(Object.keys(runner.calls[0]?.tests[0] ?? {}).sort()).toEqual(['id', 'input']);
	});

	it('shows a wrong answer with the actual output and stderr', async () => {
		const { learner } = await setup({
			tests: { [exampleId]: { status: 'ok', stdout: '3\n', stderr: 'warn' } }
		});

		const view = await learner.run('stacks-push', { 'main.py': 'x' }, 0, 'python');

		expect(view.tests[0]).toMatchObject({
			status: 'wrongAnswer',
			passed: false,
			actual: '3\n',
			stderr: 'warn'
		});
	});

	it('returns a compile error as one block', async () => {
		const { learner } = await setup({ compileError: 'SyntaxError: bad' });

		expect(await learner.run('stacks-push', { 'main.py': 'x' }, 0, 'python')).toEqual({
			revision: 1,
			compileError: 'SyntaxError: bad',
			tests: []
		});
	});

	it('never changes progress: no Read mark, status, Submission or other Problem changes', async () => {
		const { learner, db } = await setup({
			tests: { [exampleId]: { status: 'ok', stdout: '2\n' } }
		});
		const before = await learner.map();

		await learner.run('stacks-push', { 'main.py': 'print(2)' }, 0, 'python');

		expect(await learner.map()).toEqual(before);
		expect(await learner.topic('stacks')).toMatchObject({
			chapters: [
				{ problems: [{ status: 'Untouched' }, { status: 'Untouched' }] },
				{ problems: [{ status: 'Untouched' }] }
			]
		});
		expect(await db.chapterRead.count()).toBe(0);
		expect(await db.buildStep.count()).toBe(1);
	});

	it('applies the saveCode checks first: stale revision, invalid Build, locked or unknown', async () => {
		const { learner, runner } = await setup();
		await learner.saveCode('stacks-push', { 'main.py': 'a' }, 0, 'python');

		await expect(learner.run('stacks-push', { 'main.py': 'b' }, 0, 'python')).rejects.toMatchObject(
			{
				code: 'RevisionConflict'
			}
		);
		await expect(learner.run('stacks-push', { '../x': 'b' }, 1, 'python')).rejects.toMatchObject({
			code: 'InvalidBuild'
		});
		await expect(
			learner.run('queues-enqueue', { 'main.py': 'b' }, 0, 'python')
		).rejects.toMatchObject({
			code: 'TopicLocked'
		});
		await expect(learner.run('nope', { 'main.py': 'b' }, 0, 'python')).rejects.toMatchObject({
			code: 'NotFound'
		});
		expect(runner.calls).toHaveLength(0);
	});

	it('answers RunnerUnavailable when the Runner is down, keeping the saved code and recording nothing else', async () => {
		const { learner, db } = await setup({ unavailable: true });

		await expect(learner.run('stacks-push', { 'main.py': 'a' }, 0, 'python')).rejects.toMatchObject(
			{
				code: 'RunnerUnavailable'
			}
		);

		expect(await learner.problem('stacks-push')).toMatchObject({ revision: 1 });
		expect(await db.buildStep.count()).toBe(1);
		expect(await db.chapterRead.count()).toBe(0);
	});
});

describe('learner.submit()', () => {
	const pushExample = 'stacks-push/example/01';
	const pushHidden = 'stacks-push/hidden/01';
	const popExample = 'stacks-pop/example/01';
	const popHidden = 'stacks-pop/hidden/01';
	const peekExample = 'stacks-peek/example/01';
	/** Every Test of the fixture answers correctly unless the script says otherwise. */
	async function setup(script: RunnerScript = {}) {
		const catalogue = await loadCatalogue(fixtureDir);
		const correct: NonNullable<RunnerScript['tests']> = {};
		for (const p of ['stacks-push', 'stacks-pop', 'stacks-peek']) {
			const tests = [
				...(catalogue.problem(p)?.exampleTests ?? []),
				...(catalogue.hiddenTests(p) ?? [])
			];
			for (const t of tests) correct[t.id] = { status: 'ok', stdout: t.expected };
		}
		const runner = createScriptedRunner({ ...script, tests: { ...correct, ...script.tests } });
		const db = await createTestDb();
		const core = createLearningCore({ catalogue, db, runner });
		return { runner, db, catalogue, learner: core.forLearner('any-learner'), core };
	}
	const wrong = { status: 'ok' as const, stdout: 'WRONG' };

	it('Accepted when every Test passes: records the Submission and Solves the Problem', async () => {
		const { runner, learner, db } = await setup();

		const view = await learner.submit('stacks-push', { 'main.py': 'print(2)' }, 0, 'python');

		expect(view).toMatchObject({ verdict: 'Accepted', revision: 1, status: 'Solved' });
		expect(view.failure).toBeUndefined();
		expect(view.submissionId).toEqual(expect.any(String));
		expect(runner.calls).toHaveLength(2);
		expect(await db.submission.findFirstOrThrow()).toMatchObject({
			verdict: 'Accepted',
			failingProblemId: null,
			files: { 'main.py': 'print(2)' }
		});
	});

	it('Accepted carries the next Core Problem, and no Topic completion mid-Topic', async () => {
		const { learner } = await setup();
		const view = await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');
		expect(view.accepted).toEqual({
			nextProblemId: 'stacks-pop',
			topicCompleted: false,
			newlyUnlocked: []
		});
	});

	it('the last Core Problem completes the Topic and lists only Topics it alone Unlocks', async () => {
		const { learner } = await setup();
		await learner.reachChapterEnd('stacks-undo-log');
		await learner.reachChapterEnd('stacks-call-frames');
		await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');
		const view = await learner.submit('stacks-pop', { 'main.py': 'x' }, 0, 'python');
		// Queues needs only stacks; heaps also needs queues, so it stays out.
		expect(view.accepted).toEqual({
			nextProblemId: null,
			topicCompleted: true,
			newlyUnlocked: [{ id: 'queues', title: 'Queues' }]
		});
	});

	it('re-solving a Solved Problem reports no completion and nothing newly Unlocked', async () => {
		const { learner } = await setup();
		await learner.reachChapterEnd('stacks-undo-log');
		await learner.reachChapterEnd('stacks-call-frames');
		await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');
		await learner.submit('stacks-pop', { 'main.py': 'x' }, 0, 'python');
		const view = await learner.submit('stacks-pop', { 'main.py': 'x' }, 1, 'python');
		expect(view.accepted).toEqual({
			nextProblemId: null,
			topicCompleted: false,
			newlyUnlocked: []
		});
	});

	it("an Extra's next is the Core Problem after its parent", async () => {
		const { learner } = await setup();
		const view = await learner.submit('stacks-peek', { 'main.py': 'x' }, 0, 'python');
		expect(view.accepted?.nextProblemId).toBe('stacks-pop');
	});

	it('a Verdict other than Accepted has no accepted', async () => {
		const { learner } = await setup({ tests: { [pushExample]: wrong } });
		const view = await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');
		expect(view.accepted).toBeUndefined();
	});

	it('Wrong Answer on an Example Test shows input, expected, got and stderr', async () => {
		const { learner, db } = await setup({
			tests: { [pushExample]: { status: 'ok', stdout: '3\n', stderr: 'warn' } }
		});

		const view = await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');

		expect(view).toMatchObject({
			verdict: 'Wrong Answer',
			status: 'Attempted',
			failure: {
				kind: 'example',
				name: '01',
				input: 'push 1\npush 2\nsize\n',
				expected: '2\n',
				actual: '3\n',
				stderr: 'warn'
			}
		});
		const rows = await db.submission.findMany();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			learnerId: 'any-learner',
			problemId: 'stacks-push',
			topicId: 'stacks',
			language: 'python',
			files: { 'main.py': 'x' },
			verdict: 'Wrong Answer',
			failingProblemId: 'stacks-push'
		});
	});

	it.each([
		['Runtime Error', { status: 'runtimeError' as const, stdout: '', stderr: 'boom' }],
		['Time Limit Exceeded', { status: 'timeout' as const, stdout: '', stderr: '' }]
	])('%s on a Test is that Verdict, recorded', async (verdict, scripted) => {
		const { learner, db } = await setup({ tests: { [pushExample]: scripted } });
		const view = await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');
		expect(view.verdict).toBe(verdict);
		expect(view.failure).toMatchObject({ kind: 'example', stderr: scripted.stderr });
		expect((await db.submission.findFirstOrThrow()).verdict).toBe(verdict);
	});

	it('Compile Error is one message, recorded with no failing Problem', async () => {
		const { learner, db } = await setup({ compileError: 'SyntaxError: bad' });
		const view = await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');
		expect(view).toMatchObject({
			verdict: 'Compile Error',
			failure: { kind: 'compile', message: 'SyntaxError: bad' },
			status: 'Attempted'
		});
		expect((await db.submission.findFirstOrThrow()).failingProblemId).toBeNull();
	});

	it('picks the Verdict by precedence: Compile Error > TLE > Runtime Error > Wrong Answer', async () => {
		const tle = { status: 'timeout' as const };
		const rte = { status: 'runtimeError' as const };
		const verdictOf = async (tests: RunnerScript['tests']) =>
			(
				await (
					await setup({ tests })
				).learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python')
			).verdict;

		expect(await verdictOf({ [pushExample]: wrong, [pushHidden]: rte })).toBe('Runtime Error');
		expect(await verdictOf({ [pushExample]: rte, [pushHidden]: tle })).toBe('Time Limit Exceeded');
		expect(await verdictOf({ [pushExample]: wrong, [pushHidden]: tle, [popExample]: rte })).toBe(
			'Time Limit Exceeded'
		);
		expect(await verdictOf({ [pushExample]: wrong, [pushHidden]: wrong })).toBe('Wrong Answer');
	});

	it('reports the first failing Test in run order among those with the winning outcome', async () => {
		const { learner } = await setup({
			tests: {
				[pushHidden]: { status: 'runtimeError' },
				[pushExample]: { status: 'runtimeError', stderr: 'first' }
			}
		});
		const view = await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');
		expect(view.failure).toMatchObject({ kind: 'example', stderr: 'first' });
	});

	it("runs this Problem's Example Tests in one Runner call and every other Test in a second, ids and inputs only", async () => {
		const { learner, runner } = await setup();
		await learner.submit('stacks-pop', { 'main.py': 'x' }, 0, 'python');

		expect(runner.calls.map((c) => c.tests.map((t) => t.id))).toEqual([
			[popExample],
			[pushExample, pushHidden, popHidden]
		]);
		expect(
			runner.calls.flatMap((c) => c.tests).every((t) => Object.keys(t).sort().join() === 'id,input')
		).toBe(true);
		expect(runner.calls.every((c) => c.files['main.py'] === 'x')).toBe(true);
	});

	it('never puts a Hidden input in the same Runner call as a visible Example Test', async () => {
		const { learner, runner, catalogue } = await setup();
		for (const id of ['stacks-push', 'stacks-pop', 'stacks-peek']) {
			runner.calls.length = 0;
			await learner.submit(id, { 'main.py': id }, (await learner.problem(id)).revision, 'python');
			const visible = catalogue.problem(id)?.exampleTests.map((t) => t.id) ?? [];
			for (const call of runner.calls) {
				const ids = call.tests.map((t) => t.id);
				if (ids.some((t) => visible.includes(t))) expect(ids).toEqual(visible);
			}
			expect(runner.calls).toHaveLength(2);
		}
	});

	it('a Compile Error from the first call is the Verdict and the second call is skipped', async () => {
		const { learner, runner } = await setup({ compileError: 'SyntaxError: bad' });
		const view = await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');
		expect(view.verdict).toBe('Compile Error');
		expect(runner.calls).toHaveLength(1);
	});

	it('a compile error only in the second Runner call is never shown: RunnerUnavailable, nothing recorded', async () => {
		const { db, catalogue } = await setup();
		let calls = 0;
		const core = createLearningCore({
			catalogue,
			db,
			runner: {
				execute: async () =>
					++calls === 1
						? { results: [{ id: pushExample, status: 'ok', stdout: '2\n', stderr: '' }] }
						: { compileError: 'PRIVATE', results: [] }
			}
		});
		await expect(
			core.forLearner('y').submit('stacks-push', { 'main.py': 'x' }, 0, 'python')
		).rejects.toMatchObject({ code: 'RunnerUnavailable' });
		expect(await db.submission.count()).toBe(0);
	});

	it('either Runner call failing is RunnerUnavailable and records nothing', async () => {
		const { db, catalogue } = await setup();
		let calls = 0;
		const core = createLearningCore({
			catalogue,
			db,
			runner: {
				execute: async () => {
					if (++calls === 2) throw new Error('down');
					return { results: [{ id: pushExample, status: 'ok', stdout: '2\n', stderr: '' }] };
				}
			}
		});
		await expect(
			core.forLearner('y').submit('stacks-push', { 'main.py': 'x' }, 0, 'python')
		).rejects.toMatchObject({ code: 'RunnerUnavailable' });
		expect(await db.submission.count()).toBe(0);
	});

	it('a failing Hidden Test of this Problem reveals only the Problem and the Verdict', async () => {
		const { learner } = await setup({ tests: { [pushHidden]: wrong } });
		const view = await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');

		expect(view.verdict).toBe('Wrong Answer');
		expect(view.failure).toEqual({ kind: 'hidden', problemId: 'stacks-push' });
		const json = JSON.stringify(view);
		expect(json).not.toContain('WRONG');
		expect(json).not.toContain('push 5');
	});

	it('a failing earlier Core Problem Test is an earlier-step failure with no Test data', async () => {
		const { learner, db } = await setup({
			tests: { [pushExample]: { status: 'ok', stdout: 'WRONG', stderr: 'secret' } }
		});
		const view = await learner.submit('stacks-pop', { 'main.py': 'x' }, 0, 'python');

		expect(view.failure).toEqual({
			kind: 'earlierStep',
			problemId: 'stacks-push',
			problemTitle: 'Push and size'
		});
		const json = JSON.stringify(view);
		expect(json).not.toContain('WRONG');
		expect(json).not.toContain('secret');
		expect(await db.submission.findFirstOrThrow()).toMatchObject({
			problemId: 'stacks-pop',
			failingProblemId: 'stacks-push'
		});
		expect(view.status).toBe('Attempted');
	});

	it('an earlier Hidden Test failure is also an earlier-step failure', async () => {
		const { learner } = await setup({ tests: { [pushHidden]: wrong } });
		const view = await learner.submit('stacks-pop', { 'main.py': 'x' }, 0, 'python');
		expect(view.failure).toMatchObject({ kind: 'earlierStep', problemId: 'stacks-push' });
	});

	it('an Extra runs its own Example Tests first, then its parent and earlier Core Tests, never later Core Problems', async () => {
		const { learner, runner } = await setup();
		await learner.submit('stacks-peek', { 'main.py': 'x' }, 0, 'python');
		expect(runner.calls.map((c) => c.tests.map((t) => t.id))).toEqual([
			[peekExample],
			[pushExample, pushHidden]
		]);
	});

	it('a Runner outage records nothing and leaves the status, keeping the saved code', async () => {
		const { learner, db } = await setup({ unavailable: true });
		await expect(
			learner.submit('stacks-push', { 'main.py': 'a' }, 0, 'python')
		).rejects.toMatchObject({
			code: 'RunnerUnavailable'
		});
		expect(await db.submission.count()).toBe(0);
		expect(await learner.problem('stacks-push')).toMatchObject({
			status: 'Untouched',
			revision: 1,
			files: { 'main.py': 'a' }
		});
	});

	it('applies the saveCode checks first', async () => {
		const { learner, runner, db } = await setup();
		await learner.saveCode('stacks-push', { 'main.py': 'a' }, 0, 'python');
		await expect(
			learner.submit('stacks-push', { 'main.py': 'b' }, 0, 'python')
		).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		await expect(learner.submit('stacks-push', { '../x': 'b' }, 1, 'python')).rejects.toMatchObject(
			{
				code: 'InvalidBuild'
			}
		);
		await expect(
			learner.submit('queues-enqueue', { 'main.py': 'b' }, 0, 'python')
		).rejects.toMatchObject({
			code: 'TopicLocked'
		});
		await expect(learner.submit('nope', { 'main.py': 'b' }, 0, 'python')).rejects.toMatchObject({
			code: 'NotFound'
		});
		expect(runner.calls).toHaveLength(0);
		expect(await db.submission.count()).toBe(0);
	});

	it('a Problem stays Solved after a later failing Submission', async () => {
		const { db, catalogue, learner } = await setup();
		expect((await learner.submit('stacks-push', { 'main.py': 'a' }, 0, 'python')).status).toBe(
			'Solved'
		);

		const failing = createLearningCore({
			catalogue,
			db,
			runner: createScriptedRunner({ tests: { [pushExample]: wrong } })
		}).forLearner('any-learner');
		const view = await failing.submit('stacks-push', { 'main.py': 'b' }, 1, 'python');

		expect(view).toMatchObject({ verdict: 'Wrong Answer', status: 'Solved' });
		expect((await failing.topic('stacks')).chapters[0]?.problems[0]?.status).toBe('Solved');
	});

	it('Solving the last Core Problem with every Chapter Read completes the Topic', async () => {
		const { learner } = await setup();
		await learner.reachChapterEnd('stacks-undo-log');
		await learner.reachChapterEnd('stacks-call-frames');
		await learner.submit('stacks-push', { 'main.py': 'a' }, 0, 'python');
		expect((await learner.map()).topics[0]).toMatchObject({ state: 'unlocked', coreSolved: 1 });

		await learner.submit('stacks-pop', { 'main.py': 'b' }, 0, 'python');

		expect((await learner.map()).topics[0]).toMatchObject({ state: 'complete', coreSolved: 2 });
	});

	it('shows Attempted on the Topic after a failing Submission, and the Topic as current', async () => {
		const { learner } = await setup({ tests: { [pushExample]: wrong } });
		await learner.submit('stacks-push', { 'main.py': 'a' }, 0, 'python');
		expect((await learner.topic('stacks')).chapters[0]?.problems[0]?.status).toBe('Attempted');
		expect((await learner.map()).currentTopicId).toBe('stacks');
	});

	it('answers RunnerUnavailable when no Runner is configured', async () => {
		const core = createLearningCore({
			catalogue: await loadCatalogue(fixtureDir),
			db: await createTestDb()
		});
		await expect(
			core.forLearner('x').submit('stacks-push', { 'main.py': 'a' }, 0, 'python')
		).rejects.toMatchObject({ code: 'RunnerUnavailable' });
	});
});

describe('learner.switchLanguage()', () => {
	async function setup() {
		const catalogue = await loadCatalogue(fixtureDir);
		const runner = createScriptedRunner();
		const db = await createTestDb();
		const core = createLearningCore({ catalogue, db, runner });
		return { catalogue, db, runner, learner: core.forLearner('any-learner') };
	}

	it('starts the first Problem of a Topic empty, with the TypeScript entry file', async () => {
		const { learner } = await setup();

		await learner.switchLanguage('stacks', 'typescript');

		expect(await learner.problem('stacks-push')).toMatchObject({
			language: 'typescript',
			files: { 'main.ts': '' },
			revision: 0
		});
	});

	it("starts a later Problem from the Learner's previous step in that Language, else its Reference Code", async () => {
		const { learner, catalogue } = await setup();
		await learner.switchLanguage('stacks', 'typescript');

		expect((await learner.problem('stacks-pop')).files).toEqual(
			catalogue.problem('stacks-push')?.referenceCode.typescript
		);
		await learner.saveCode('stacks-push', { 'main.ts': 'mine' }, 0, 'typescript');
		expect((await learner.problem('stacks-pop')).files).toEqual({ 'main.ts': 'mine' });
	});

	it('keeps the old Language Build, and switching back restores its code and revision', async () => {
		const { learner } = await setup();
		await learner.saveCode('stacks-push', { 'main.py': 'python code' }, 0, 'python');

		await learner.switchLanguage('stacks', 'typescript');
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.ts': '' });
		await learner.saveCode('stacks-push', { 'main.ts': 'ts code' }, 0, 'typescript');
		await learner.switchLanguage('stacks', 'python');

		expect(await learner.problem('stacks-push')).toMatchObject({
			language: 'python',
			files: { 'main.py': 'python code' },
			revision: 1
		});
		await learner.switchLanguage('stacks', 'typescript');
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.ts': 'ts code' });
	});

	it('is per Topic and per Learner', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const core = createLearningCore({ catalogue, db: await createTestDb() });
		const mine = core.forLearner('mine');

		await mine.switchLanguage('stacks', 'typescript');

		expect((await core.forLearner('other').problem('stacks-push')).language).toBe('python');
		expect((await mine.problem('stacks-push')).language).toBe('typescript');
	});

	it('runs the Build in the current Language', async () => {
		const { learner, runner } = await setup();
		await learner.switchLanguage('stacks', 'typescript');

		await learner.run('stacks-push', { 'main.ts': 'console.log(2)' }, 0, 'typescript');

		expect(runner.calls[0].language).toBe('typescript');
	});

	it('records a Submission in the current Language', async () => {
		const { learner, db } = await setup();
		await learner.switchLanguage('stacks', 'typescript');

		await learner.submit('stacks-push', { 'main.ts': 'console.log(2)' }, 0, 'typescript');

		expect((await db.submission.findFirstOrThrow()).language).toBe('typescript');
	});

	it('throws NotFound for an unknown Topic and TopicLocked for a Locked one', async () => {
		const { learner } = await setup();

		await expect(learner.switchLanguage('nope', 'typescript')).rejects.toMatchObject({
			code: 'NotFound'
		});
		await expect(learner.switchLanguage('queues', 'typescript')).rejects.toMatchObject({
			code: 'TopicLocked'
		});
	});
});

describe('a tab acts on the Language it was loaded with', () => {
	async function setup() {
		const catalogue = await loadCatalogue(fixtureDir);
		const runner = createScriptedRunner();
		const db = await createTestDb();
		const core = createLearningCore({ catalogue, db, runner });
		const learner = core.forLearner('any-learner');
		// The stale tab saved Python (revision 1); another tab then switched the Topic to TypeScript
		// and saved there too (revision 1), so both Builds sit at the same revision.
		await learner.saveCode('stacks-push', { 'main.py': 'python v1' }, 0, 'python');
		await learner.switchLanguage('stacks', 'typescript');
		await learner.saveCode('stacks-push', { 'main.ts': 'ts v1' }, 0, 'typescript');
		return { learner, runner, db };
	}

	it('refuses a stale-Language save and leaves both Builds untouched', async () => {
		const { learner, db } = await setup();

		await expect(
			learner.saveCode('stacks-push', { 'main.py': 'python v2' }, 1, 'python')
		).rejects.toMatchObject({ code: 'RevisionConflict' });

		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.ts': 'ts v1' });
		const python = await db.buildStep.findMany({ where: { language: 'python' } });
		expect(python.map((r) => [r.files, r.revision])).toEqual([[{ 'main.py': 'python v1' }, 1]]);
	});

	it('refuses a stale-Language run: nothing saved, nothing executed', async () => {
		const { learner, runner } = await setup();

		await expect(
			learner.run('stacks-push', { 'main.py': 'python v2' }, 1, 'python')
		).rejects.toMatchObject({ code: 'RevisionConflict' });

		expect(runner.calls).toHaveLength(0);
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.ts': 'ts v1' });
	});

	it('refuses a stale-Language submit: no Submission, nothing executed', async () => {
		const { learner, runner, db } = await setup();

		await expect(
			learner.submit('stacks-push', { 'main.py': 'python v2' }, 1, 'python')
		).rejects.toMatchObject({ code: 'RevisionConflict' });

		expect(runner.calls).toHaveLength(0);
		expect(await db.submission.count()).toBe(0);
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.ts': 'ts v1' });
	});

	it('refuses a stale-Language first save too, creating no Build', async () => {
		const { learner, db } = await setup();

		await expect(
			learner.saveCode('stacks-pop', { 'main.py': 'late' }, 0, 'python')
		).rejects.toMatchObject({ code: 'RevisionConflict' });

		expect(await db.buildStep.count({ where: { problemId: 'stacks-pop' } })).toBe(0);
	});

	it('still saves, runs and submits in the current Language', async () => {
		const { learner, runner } = await setup();

		expect(await learner.saveCode('stacks-push', { 'main.ts': 'ts v2' }, 1, 'typescript')).toEqual({
			revision: 2
		});
		await learner.run('stacks-push', { 'main.ts': 'ts v3' }, 2, 'typescript');
		const view = await learner.submit('stacks-push', { 'main.ts': 'ts v4' }, 3, 'typescript');

		expect(view.revision).toBe(4);
		expect(runner.calls.every((c) => c.language === 'typescript')).toBe(true);
	});
});

describe('the Accepted panel credits only its own Submission', () => {
	it('two submits racing: only the one that completes the Topic reports topicCompleted', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const correct: NonNullable<RunnerScript['tests']> = {};
		for (const p of ['stacks-push', 'stacks-pop', 'stacks-peek']) {
			const tests = [
				...(catalogue.problem(p)?.exampleTests ?? []),
				...(catalogue.hiddenTests(p) ?? [])
			];
			for (const t of tests) correct[t.id] = { status: 'ok', stdout: t.expected };
		}
		const inner = createScriptedRunner({ tests: correct });
		// Both Runner calls are held until both submits are in flight, so their database
		// steps start together and interleave.
		let hold: { waiting: number; release: () => void; gate: Promise<void> } | undefined;
		const runner = {
			...inner,
			async execute(request: Parameters<typeof inner.execute>[0]) {
				if (hold && ++hold.waiting >= 2) hold.release();
				await hold?.gate;
				return inner.execute(request);
			}
		};
		const core = createLearningCore({ catalogue, db: await createTestDb(), runner });
		const learner = core.forLearner('any-learner');
		await learner.reachChapterEnd('stacks-undo-log');
		await learner.reachChapterEnd('stacks-call-frames');
		await learner.submit('stacks-push', { 'main.py': 'x' }, 0, 'python');
		let release: () => void = () => {};
		hold = { waiting: 0, release: () => release(), gate: new Promise<void>((r) => (release = r)) };

		const [extra, completing] = await Promise.all([
			learner.submit('stacks-peek', { 'main.py': 'x' }, 0, 'python'),
			learner.submit('stacks-pop', { 'main.py': 'x' }, 0, 'python')
		]);

		expect(completing.accepted?.topicCompleted).toBe(true);
		expect(extra.accepted?.topicCompleted).toBe(false);
	});
});
