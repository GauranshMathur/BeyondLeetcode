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
		await learner.saveCode('stacks-push', { 'main.py': 'mine v1' }, 0);
		await learner.saveCode('stacks-push', { 'main.py': 'mine v2', 'util.py': 'x' }, 1);

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

		await learner.saveCode('stacks-push', { 'main.py': 'parent code' }, 0);
		expect((await learner.problem('stacks-peek')).files).toEqual({ 'main.py': 'parent code' });
	});

	it('copies a step once: once saved, later changes to its source never change it', async () => {
		const { learner } = await setup();
		const seeded = (await learner.problem('stacks-pop')).files;
		await learner.saveCode('stacks-pop', seeded, 0);

		await learner.saveCode('stacks-push', { 'main.py': 'edited after' }, 0);

		expect((await learner.problem('stacks-pop')).files).toEqual(seeded);
	});

	it('saves code, returns the new revision and shows it again, per Learner', async () => {
		const { learner, core } = await setup();

		expect(await learner.saveCode('stacks-push', { 'main.py': 'a' }, 0)).toEqual({ revision: 1 });
		expect(await learner.saveCode('stacks-push', { 'main.py': 'ab' }, 1)).toEqual({ revision: 2 });

		const view = await learner.problem('stacks-push');
		expect(view.files).toEqual({ 'main.py': 'ab' });
		expect(view.revision).toBe(2);
		const other = await core.forLearner('someone-else').problem('stacks-push');
		expect(other).toMatchObject({ files: { 'main.py': '' }, revision: 0 });
	});

	it('returns RevisionConflict for a stale revision and keeps the stored code', async () => {
		const { learner } = await setup();
		await learner.saveCode('stacks-push', { 'main.py': 'tab one' }, 0);

		await expect(
			learner.saveCode('stacks-push', { 'main.py': 'tab two' }, 0)
		).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		await expect(
			learner.saveCode('stacks-push', { 'main.py': 'tab two' }, 5)
		).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.py': 'tab one' });
	});

	it('lets only one of two concurrent first saves win', async () => {
		const { learner } = await setup();
		const results = await Promise.allSettled([
			learner.saveCode('stacks-push', { 'main.py': 'a' }, 0),
			learner.saveCode('stacks-push', { 'main.py': 'b' }, 0)
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
		await expect(learner.saveCode('stacks-push', files, 0)).rejects.toMatchObject({
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
				0
			)
		).resolves.toEqual({ revision: 1 });
	});

	it('refuses an unknown Problem and one in a Locked Topic', async () => {
		const { learner } = await setup();
		await expect(learner.problem('nope')).rejects.toMatchObject({ code: 'NotFound' });
		await expect(learner.problem('queues-enqueue')).rejects.toMatchObject({ code: 'TopicLocked' });
		await expect(learner.saveCode('nope', { 'main.py': '' }, 0)).rejects.toMatchObject({
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

		const view = await learner.run('stacks-push', { 'main.py': 'print(2)' }, 0);

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

		const view = await learner.run('stacks-push', { 'main.py': 'x' }, 0);

		expect(view.tests[0]).toMatchObject({
			status: 'wrongAnswer',
			passed: false,
			actual: '3\n',
			stderr: 'warn'
		});
	});

	it('returns a compile error as one block', async () => {
		const { learner } = await setup({ compileError: 'SyntaxError: bad' });

		expect(await learner.run('stacks-push', { 'main.py': 'x' }, 0)).toEqual({
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

		await learner.run('stacks-push', { 'main.py': 'print(2)' }, 0);

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
		await learner.saveCode('stacks-push', { 'main.py': 'a' }, 0);

		await expect(learner.run('stacks-push', { 'main.py': 'b' }, 0)).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		await expect(learner.run('stacks-push', { '../x': 'b' }, 1)).rejects.toMatchObject({
			code: 'InvalidBuild'
		});
		await expect(learner.run('queues-enqueue', { 'main.py': 'b' }, 0)).rejects.toMatchObject({
			code: 'TopicLocked'
		});
		await expect(learner.run('nope', { 'main.py': 'b' }, 0)).rejects.toMatchObject({
			code: 'NotFound'
		});
		expect(runner.calls).toHaveLength(0);
	});

	it('answers RunnerUnavailable when the Runner is down, keeping the saved code and recording nothing else', async () => {
		const { learner, db } = await setup({ unavailable: true });

		await expect(learner.run('stacks-push', { 'main.py': 'a' }, 0)).rejects.toMatchObject({
			code: 'RunnerUnavailable'
		});

		expect(await learner.problem('stacks-push')).toMatchObject({ revision: 1 });
		expect(await db.buildStep.count()).toBe(1);
		expect(await db.chapterRead.count()).toBe(0);
	});
});
