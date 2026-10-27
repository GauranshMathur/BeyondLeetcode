import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { filesDigest } from '../../problem-wire.ts';
import { type Language, loadCatalogue } from '../content/catalogue.ts';
import { createScriptedRunner, type RunnerScript } from '../runner/fake.ts';
import type { ExecuteResult } from '../runner/port.ts';
import { createFileTestDb, createTestDb } from '../test-db.ts';
import {
	type BuildRef,
	createLearningCore as createCoreOnDb,
	type LearningCoreDeps,
	LearningError
} from './core.ts';
import { submitPlan } from './rules.ts';

/**
 * The Learning core, with every Learner a test names given its row first: the database refuses
 * progress for a Learner that has none (C56), as it does for a removed one.
 */
function createLearningCore(deps: LearningCoreDeps) {
	const core = createCoreOnDb(deps);
	const created = new Map<string, Promise<unknown>>();
	return {
		...core,
		forLearner: (id: string) => {
			const learner = core.forLearner(id);
			const ready = () => {
				let p = created.get(id);
				if (!p) {
					p = deps.db.learner.upsert({ where: { id }, update: {}, create: { id } });
					created.set(id, p);
				}
				return p;
			};
			return new Proxy(learner, {
				get: (target, key) => {
					const member = target[key as keyof typeof target];
					if (typeof member !== 'function') return member;
					return async (...args: unknown[]) => {
						await ready();
						return (member as (...a: unknown[]) => unknown)(...args);
					};
				}
			});
		}
	};
}

const ref = (problemId: string, revision: number, language: Language = 'python'): BuildRef => ({
	problemId,
	language,
	revision
});

const rendered = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../markdown.ts', async (original) => {
	const actual = await original<typeof import('../markdown.ts')>();
	return {
		...actual,
		renderMarkdown: (markdown: string) => {
			rendered.calls++;
			return actual.renderMarkdown(markdown);
		}
	};
});

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
			build: { problemId: 'stacks-push', language: 'python', revision: 0 },
			files: { 'main.py': '' },
			seedNotes: {
				python: 'starts empty',
				typescript: 'starts empty',
				go: 'starts empty'
			},
			status: 'Untouched'
		});
	});

	it("tells the picker what a new Build would start from: the Learner's code in that Language, else the Reference Code", async () => {
		const { learner } = await setup();
		expect((await learner.problem('stacks-pop')).seedNotes).toEqual({
			python: 'starts from the reference code for the previous Problem',
			typescript: 'starts from the reference code for the previous Problem',
			go: 'starts from the reference code for the previous Problem'
		});

		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'mine' });
		expect((await learner.problem('stacks-pop')).seedNotes).toMatchObject({
			python: 'starts from your code for the previous Problem',
			typescript: 'starts from the reference code for the previous Problem'
		});
	});

	it('starts a Core Problem from the Reference Code after the previous Core Problem when nothing was saved', async () => {
		const { learner, catalogue } = await setup();

		const view = await learner.problem('stacks-pop');

		expect(view.files).toEqual(catalogue.problem('stacks-push')?.referenceCode.python);
		expect(view.build).toEqual({ problemId: 'stacks-pop', language: 'python', revision: 0 });
	});

	it("starts a Core Problem from the Learner's latest saved code for the previous Core Problem", async () => {
		const { learner } = await setup();
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'mine v1' });
		await learner.saveCode(ref('stacks-push', 1), { 'main.py': 'mine v2', 'util.py': 'x' });

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

		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'parent code' });
		expect((await learner.problem('stacks-peek')).files).toEqual({ 'main.py': 'parent code' });
	});

	it('copies a step once: once saved, later changes to its source never change it', async () => {
		const { learner } = await setup();
		const seeded = (await learner.problem('stacks-pop')).files;
		await learner.saveCode(ref('stacks-pop', 0), seeded);

		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'edited after' });

		expect((await learner.problem('stacks-pop')).files).toEqual(seeded);
	});

	it('saves code, returns the new revision and shows it again, per Learner', async () => {
		const { learner, core } = await setup();

		expect(await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a' })).toEqual({
			revision: 1
		});
		expect(await learner.saveCode(ref('stacks-push', 1), { 'main.py': 'ab' })).toEqual({
			revision: 2
		});

		const view = await learner.problem('stacks-push');
		expect(view.files).toEqual({ 'main.py': 'ab' });
		expect(view.build.revision).toBe(2);
		const other = await core.forLearner('someone-else').problem('stacks-push');
		expect(other).toMatchObject({ files: { 'main.py': '' }, build: { revision: 0 } });
	});

	it('returns RevisionConflict for a stale revision and keeps the stored code', async () => {
		const { learner } = await setup();
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'tab one' });

		await expect(
			learner.saveCode(ref('stacks-push', 0), { 'main.py': 'tab two' })
		).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		await expect(
			learner.saveCode(ref('stacks-push', 5), { 'main.py': 'tab two' })
		).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.py': 'tab one' });
	});

	it('answers a retried save one revision behind with the same files as saved, writing nothing', async () => {
		const { learner } = await setup();
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a', 'util.py': 'b' });
		await learner.saveCode(ref('stacks-push', 1), { 'main.py': 'c', 'util.py': 'd' });
		const before = await learner.problem('stacks-push');

		// The reply to the save at revision 1 was lost; the tab sends it again, keys in another order.
		await expect(
			learner.saveCode(ref('stacks-push', 1), { 'util.py': 'd', 'main.py': 'c' })
		).resolves.toEqual({ revision: 2 });
		expect(await learner.problem('stacks-push')).toEqual(before);

		// Also the very first save, retried at revision 0.
		const other = await setup();
		await other.learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a' });
		await expect(
			other.learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a' })
		).resolves.toEqual({ revision: 1 });
	});

	it('still refuses one revision behind with different files, two behind with the same files, or a missing path', async () => {
		const { learner } = await setup();
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a' });
		await learner.saveCode(ref('stacks-push', 1), { 'main.py': 'b' });
		await learner.saveCode(ref('stacks-push', 2), { 'main.py': 'a' });

		await expect(learner.saveCode(ref('stacks-push', 2), { 'main.py': 'b' })).rejects.toMatchObject(
			{ code: 'RevisionConflict' }
		);
		// ABA: the same files as stored, but two behind.
		await expect(learner.saveCode(ref('stacks-push', 1), { 'main.py': 'a' })).rejects.toMatchObject(
			{ code: 'RevisionConflict' }
		);
		await expect(
			learner.saveCode(ref('stacks-push', 2), { 'main.py': 'a', 'x.py': '' })
		).rejects.toMatchObject({ code: 'RevisionConflict' });
		expect((await learner.problem('stacks-push')).build.revision).toBe(3);
	});

	it('still validates the Build of a retried save', async () => {
		const { learner } = await setup();
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a' });
		await expect(learner.saveCode(ref('stacks-push', 0), { '../x': 'a' })).rejects.toMatchObject({
			code: 'InvalidBuild'
		});
	});

	it('lets only one of two concurrent first saves win', async () => {
		const { learner } = await setup();
		const results = await Promise.allSettled([
			learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a' }),
			learner.saveCode(ref('stacks-push', 0), { 'main.py': 'b' })
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
		await expect(learner.saveCode(ref('stacks-push', 0), files)).rejects.toMatchObject({
			code: 'InvalidBuild'
		});
		expect((await learner.problem('stacks-push')).build.revision).toBe(0);
	});

	it('accepts nested relative paths and code right at the limit', async () => {
		const { learner } = await setup();
		await expect(
			learner.saveCode(ref('stacks-push', 0), {
				'pkg/util.py': 'x'.repeat(256 * 1024 - 'pkg/util.py'.length)
			})
		).resolves.toEqual({ revision: 1 });
	});

	it('refuses an unknown Problem and one in a Locked Topic', async () => {
		const { learner } = await setup();
		await expect(learner.problem('nope')).rejects.toMatchObject({ code: 'NotFound' });
		await expect(learner.problem('queues-enqueue')).rejects.toMatchObject({ code: 'TopicLocked' });
		await expect(learner.saveCode(ref('nope', 0), { 'main.py': '' })).rejects.toMatchObject({
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

		const view = await learner.run(ref('stacks-push', 0), { 'main.py': 'print(2)' });

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
			build: { revision: 1 }
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

		const view = await learner.run(ref('stacks-push', 0), { 'main.py': 'x' });

		expect(view.tests[0]).toMatchObject({
			status: 'wrongAnswer',
			passed: false,
			actual: '3\n',
			stderr: 'warn'
		});
	});

	it('returns a compile error as one block', async () => {
		const { learner } = await setup({ compileError: 'SyntaxError: bad' });

		expect(await learner.run(ref('stacks-push', 0), { 'main.py': 'x' })).toEqual({
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

		await learner.run(ref('stacks-push', 0), { 'main.py': 'print(2)' });

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
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a' });

		await expect(learner.run(ref('stacks-push', 0), { 'main.py': 'b' })).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		await expect(learner.run(ref('stacks-push', 1), { '../x': 'b' })).rejects.toMatchObject({
			code: 'InvalidBuild'
		});
		await expect(learner.run(ref('queues-enqueue', 0), { 'main.py': 'b' })).rejects.toMatchObject({
			code: 'TopicLocked'
		});
		await expect(learner.run(ref('nope', 0), { 'main.py': 'b' })).rejects.toMatchObject({
			code: 'NotFound'
		});
		expect(runner.calls).toHaveLength(0);
	});

	it('answers RunnerUnavailable when the Runner is down, keeping the saved code and recording nothing else', async () => {
		const { learner, db } = await setup({ unavailable: true });

		// The error carries the revision the save produced, so no caller works it out.
		await expect(learner.run(ref('stacks-push', 0), { 'main.py': 'a' })).rejects.toMatchObject({
			code: 'RunnerUnavailable',
			revision: 1
		});

		expect(await learner.problem('stacks-push')).toMatchObject({ build: { revision: 1 } });
		expect(await db.buildStep.count()).toBe(1);
		expect(await db.chapterRead.count()).toBe(0);
	});
});

describe('learner.submit() when the Runner is down', () => {
	it('answers RunnerUnavailable carrying the saved revision, recording no Submission', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const db = await createTestDb();
		const learner = createLearningCore({
			catalogue,
			db,
			runner: createScriptedRunner({ unavailable: true })
		}).forLearner('any-learner');
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a' });

		await expect(learner.submit(ref('stacks-push', 1), { 'main.py': 'b' })).rejects.toMatchObject({
			code: 'RunnerUnavailable',
			revision: 2
		});

		expect(await db.submission.count()).toBe(0);
		expect((await learner.problem('stacks-push')).build.revision).toBe(2);
	});

	it('carries no revision on a refusal that saved nothing', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const learner = createLearningCore({
			catalogue,
			db: await createTestDb(),
			runner: createScriptedRunner({})
		}).forLearner('any-learner');

		const refusal = await learner.submit(ref('stacks-push', 7), { 'main.py': 'b' }).catch((e) => e);

		expect(refusal).toMatchObject({ code: 'RevisionConflict' });
		expect(refusal.revision).toBeUndefined();
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

		const view = await learner.submit(ref('stacks-push', 0), { 'main.py': 'print(2)' });

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
		const view = await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });
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
		await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });
		const view = await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
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
		await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });
		await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
		const view = await learner.submit(ref('stacks-pop', 1), { 'main.py': 'x' });
		expect(view.accepted).toEqual({
			nextProblemId: null,
			topicCompleted: false,
			newlyUnlocked: []
		});
	});

	it("an Extra's next is the Core Problem after its parent", async () => {
		const { learner } = await setup();
		const view = await learner.submit(ref('stacks-peek', 0), { 'main.py': 'x' });
		expect(view.accepted?.nextProblemId).toBe('stacks-pop');
	});

	it('a Verdict other than Accepted has no accepted', async () => {
		const { learner } = await setup({ tests: { [pushExample]: wrong } });
		const view = await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });
		expect(view.accepted).toBeUndefined();
	});

	it('Wrong Answer on an Example Test shows input, expected, got and stderr', async () => {
		const { learner, db } = await setup({
			tests: { [pushExample]: { status: 'ok', stdout: '3\n', stderr: 'warn' } }
		});

		const view = await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });

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
		const view = await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });
		expect(view.verdict).toBe(verdict);
		expect(view.failure).toMatchObject({ kind: 'example', stderr: scripted.stderr });
		expect((await db.submission.findFirstOrThrow()).verdict).toBe(verdict);
	});

	it('an Example Test timing out ends the Submission after the first call', async () => {
		const { learner, runner } = await setup({ tests: { [pushExample]: { status: 'timeout' } } });
		const view = await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });
		expect(view.verdict).toBe('Time Limit Exceeded');
		expect(runner.calls).toHaveLength(1);
	});

	it('Compile Error is one message, recorded with no failing Problem', async () => {
		const { learner, db } = await setup({ compileError: 'SyntaxError: bad' });
		const view = await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });
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
			(await (await setup({ tests })).learner.submit(ref('stacks-push', 0), { 'main.py': 'x' }))
				.verdict;

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
		const view = await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });
		expect(view.failure).toMatchObject({ kind: 'example', stderr: 'first' });
	});

	it("runs this Problem's Example Tests in one Runner call and every other Test in a second, ids and inputs only", async () => {
		const { learner, runner } = await setup();
		await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });

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
			await learner.submit(ref(id, (await learner.problem(id)).build.revision), { 'main.py': id });
			const visible = catalogue.problem(id)?.exampleTests.map((t) => t.id) ?? [];
			for (const call of runner.calls) {
				const ids = call.tests.map((t) => t.id);
				if (ids.some((t) => visible.includes(t))) expect(ids).toEqual(visible);
			}
			expect(runner.calls).toHaveLength(2);
		}
	});

	describe('hidden Tests in containers of at most hiddenBatchTests', () => {
		/** A core whose hidden containers hold one Test, so the fixture splits. */
		async function setupSplit(script: RunnerScript = {}) {
			const base = await setup(script);
			const core = createLearningCore({
				catalogue: base.catalogue,
				db: base.db,
				runner: base.runner,
				hiddenBatchTests: 1
			});
			return { ...base, learner: core.forLearner('any-learner') };
		}
		const idsOf = (calls: { tests: { id: string }[] }[]) =>
			calls.map((c) => c.tests.map((t) => t.id));

		it('runs the visible Tests first, then the hidden ones in order, one per call', async () => {
			const { learner, runner, catalogue } = await setupSplit();
			const view = await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
			expect(view.verdict).toBe('Accepted');
			const plan = submitPlan(catalogue, 'stacks-pop', 1);
			expect(plan.hidden.length).toBeGreaterThan(1);
			expect(idsOf(runner.calls)).toEqual([
				plan.visible.map((t) => t.id),
				...plan.hidden.map((b) => b.map((t) => t.id))
			]);
			expect(plan.hidden.every((b) => b.length <= 1)).toBe(true);
		});

		it('keeps every hidden call apart from the visible Tests', async () => {
			const { learner, runner, catalogue } = await setupSplit();
			await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
			const visible = catalogue.problem('stacks-pop')?.exampleTests.map((t) => t.id) ?? [];
			for (const call of runner.calls.slice(1)) {
				expect(call.tests.some((t) => visible.includes(t.id))).toBe(false);
			}
		});

		it('reports the same first failing Test as one big container: a later batch failing', async () => {
			const { learner } = await setupSplit({ tests: { 'stacks-pop/hidden/01': wrong } });
			const split = await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
			const whole = await (
				await setup({ tests: { 'stacks-pop/hidden/01': wrong } })
			).learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
			expect(split.verdict).toBe(whole.verdict);
			expect(split.failure).toEqual(whole.failure);
		});

		it('picks the earliest Test of the winning outcome across batches', async () => {
			const tests = { [pushHidden]: wrong, [popHidden]: { status: 'timeout' as const } };
			const split = await (await setupSplit({ tests })).learner.submit(ref('stacks-pop', 0), {
				'main.py': 'x'
			});
			const whole = await (await setup({ tests })).learner.submit(ref('stacks-pop', 0), {
				'main.py': 'x'
			});
			expect(split.verdict).toBe('Time Limit Exceeded');
			expect({ ...split, submissionId: '' }).toEqual({ ...whole, submissionId: '' });
		});

		it('stops after the batch holding a Time Limit Exceeded: nothing later can change the Verdict', async () => {
			const { learner, runner, catalogue } = await setupSplit({
				tests: { [pushHidden]: { status: 'timeout' } }
			});
			const view = await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
			expect(view.verdict).toBe('Time Limit Exceeded');
			const plan = submitPlan(catalogue, 'stacks-pop', 1);
			const at = plan.hidden.findIndex((b) => b.some((t) => t.id === pushHidden));
			expect(runner.calls).toHaveLength(1 + at + 1);
			expect(runner.calls.length).toBeLessThan(1 + plan.hidden.length);
		});

		it('runs every batch when a failure is not a timeout, since a later timeout would outrank it', async () => {
			const { learner, runner, catalogue } = await setupSplit({
				tests: { [pushHidden]: wrong }
			});
			await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
			expect(runner.calls).toHaveLength(1 + submitPlan(catalogue, 'stacks-pop', 1).hidden.length);
		});

		it('ignores a timeout on an id that is not one of the batch Tests: later batches still run', async () => {
			const { db, catalogue, runner } = await setup();
			const core = createLearningCore({
				catalogue,
				db,
				hiddenBatchTests: 1,
				runner: {
					execute: async (request) => {
						const real = await runner.execute(request);
						return {
							results: [...real.results, { id: 'ghost', status: 'timeout', stdout: '', stderr: '' }]
						};
					}
				}
			});
			await core.forLearner('y').submit(ref('stacks-pop', 0), { 'main.py': 'x' });
			expect(runner.calls).toHaveLength(1 + submitPlan(catalogue, 'stacks-pop', 1).hidden.length);
		});

		it.each([0, -1, 1.5, Number.NaN])('submitPlan refuses a batch size of %s', async (size) => {
			const { catalogue } = await setup();
			expect(() => submitPlan(catalogue, 'stacks-pop', size)).toThrow(RangeError);
		});

		it('a compile error in a later hidden batch is RunnerUnavailable, nothing recorded', async () => {
			const { db, catalogue } = await setup();
			let calls = 0;
			const core = createLearningCore({
				catalogue,
				db,
				hiddenBatchTests: 1,
				runner: {
					execute: async (request) =>
						++calls === 3
							? { compileError: 'PRIVATE', results: [] }
							: {
									results: request.tests.map(({ id }) => ({
										id,
										status: 'ok' as const,
										stdout: '',
										stderr: ''
									}))
								}
				}
			});
			await expect(
				core.forLearner('y').submit(ref('stacks-pop', 0), { 'main.py': 'x' })
			).rejects.toMatchObject({ code: 'RunnerUnavailable' });
			expect(await db.submission.count()).toBe(0);
		});
	});

	it('a Compile Error from the first call is the Verdict and the second call is skipped', async () => {
		const { learner, runner } = await setup({ compileError: 'SyntaxError: bad' });
		const view = await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });
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
			core.forLearner('y').submit(ref('stacks-push', 0), { 'main.py': 'x' })
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
			core.forLearner('y').submit(ref('stacks-push', 0), { 'main.py': 'x' })
		).rejects.toMatchObject({ code: 'RunnerUnavailable' });
		expect(await db.submission.count()).toBe(0);
	});

	it('a failing Hidden Test of this Problem reveals only the Problem and the Verdict', async () => {
		const { learner } = await setup({ tests: { [pushHidden]: wrong } });
		const view = await learner.submit(ref('stacks-push', 0), { 'main.py': 'x' });

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
		const view = await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });

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
		const view = await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
		expect(view.failure).toMatchObject({ kind: 'earlierStep', problemId: 'stacks-push' });
	});

	it('an Extra runs its own Example Tests first, then its parent and earlier Core Tests, never later Core Problems', async () => {
		const { learner, runner } = await setup();
		await learner.submit(ref('stacks-peek', 0), { 'main.py': 'x' });
		expect(runner.calls.map((c) => c.tests.map((t) => t.id))).toEqual([
			[peekExample],
			[pushExample, pushHidden]
		]);
	});

	it('a Runner outage records nothing and leaves the status, keeping the saved code', async () => {
		const { learner, db } = await setup({ unavailable: true });
		await expect(learner.submit(ref('stacks-push', 0), { 'main.py': 'a' })).rejects.toMatchObject({
			code: 'RunnerUnavailable'
		});
		expect(await db.submission.count()).toBe(0);
		expect(await learner.problem('stacks-push')).toMatchObject({
			status: 'Untouched',
			build: { revision: 1 },
			files: { 'main.py': 'a' }
		});
	});

	it('applies the saveCode checks first', async () => {
		const { learner, runner, db } = await setup();
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a' });
		await expect(learner.submit(ref('stacks-push', 0), { 'main.py': 'b' })).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		await expect(learner.submit(ref('stacks-push', 1), { '../x': 'b' })).rejects.toMatchObject({
			code: 'InvalidBuild'
		});
		await expect(
			learner.submit(ref('queues-enqueue', 0), { 'main.py': 'b' })
		).rejects.toMatchObject({
			code: 'TopicLocked'
		});
		await expect(learner.submit(ref('nope', 0), { 'main.py': 'b' })).rejects.toMatchObject({
			code: 'NotFound'
		});
		expect(runner.calls).toHaveLength(0);
		expect(await db.submission.count()).toBe(0);
	});

	it('a Problem stays Solved after a later failing Submission', async () => {
		const { db, catalogue, learner } = await setup();
		expect((await learner.submit(ref('stacks-push', 0), { 'main.py': 'a' })).status).toBe('Solved');

		const failing = createLearningCore({
			catalogue,
			db,
			runner: createScriptedRunner({ tests: { [pushExample]: wrong } })
		}).forLearner('any-learner');
		const view = await failing.submit(ref('stacks-push', 1), { 'main.py': 'b' });

		expect(view).toMatchObject({ verdict: 'Wrong Answer', status: 'Solved' });
		expect((await failing.topic('stacks')).chapters[0]?.problems[0]?.status).toBe('Solved');
	});

	it('Solving the last Core Problem with every Chapter Read completes the Topic', async () => {
		const { learner } = await setup();
		await learner.reachChapterEnd('stacks-undo-log');
		await learner.reachChapterEnd('stacks-call-frames');
		await learner.submit(ref('stacks-push', 0), { 'main.py': 'a' });
		expect((await learner.map()).topics[0]).toMatchObject({ state: 'unlocked', coreSolved: 1 });

		await learner.submit(ref('stacks-pop', 0), { 'main.py': 'b' });

		expect((await learner.map()).topics[0]).toMatchObject({ state: 'complete', coreSolved: 2 });
	});

	it('shows Attempted on the Topic after a failing Submission, and the Topic as current', async () => {
		const { learner } = await setup({ tests: { [pushExample]: wrong } });
		await learner.submit(ref('stacks-push', 0), { 'main.py': 'a' });
		expect((await learner.topic('stacks')).chapters[0]?.problems[0]?.status).toBe('Attempted');
		expect((await learner.map()).currentTopicId).toBe('stacks');
	});

	it('answers RunnerUnavailable when no Runner is configured', async () => {
		const core = createLearningCore({
			catalogue: await loadCatalogue(fixtureDir),
			db: await createTestDb()
		});
		await expect(
			core.forLearner('x').submit(ref('stacks-push', 0), { 'main.py': 'a' })
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

		await learner.switchLanguage('stacks-push', 'typescript');

		expect(await learner.problem('stacks-push')).toMatchObject({
			build: { problemId: 'stacks-push', language: 'typescript', revision: 0 },
			files: { 'main.ts': '' }
		});
	});

	it("starts a later Problem from the Learner's previous step in that Language, else its Reference Code", async () => {
		const { learner, catalogue } = await setup();
		await learner.switchLanguage('stacks-push', 'typescript');

		expect((await learner.problem('stacks-pop')).files).toEqual(
			catalogue.problem('stacks-push')?.referenceCode.typescript
		);
		await learner.saveCode(ref('stacks-push', 0, 'typescript'), { 'main.ts': 'mine' });
		expect((await learner.problem('stacks-pop')).files).toEqual({ 'main.ts': 'mine' });
	});

	it('keeps the old Language Build, and switching back restores its code and revision', async () => {
		const { learner } = await setup();
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'python code' });

		await learner.switchLanguage('stacks-push', 'typescript');
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.ts': '' });
		await learner.saveCode(ref('stacks-push', 0, 'typescript'), { 'main.ts': 'ts code' });
		await learner.switchLanguage('stacks-push', 'python');

		expect(await learner.problem('stacks-push')).toMatchObject({
			build: { language: 'python', revision: 1 },
			files: { 'main.py': 'python code' }
		});
		await learner.switchLanguage('stacks-push', 'typescript');
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.ts': 'ts code' });
	});

	it('is per Topic and per Learner', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const core = createLearningCore({ catalogue, db: await createTestDb() });
		const mine = core.forLearner('mine');

		await mine.switchLanguage('stacks-push', 'typescript');

		expect((await core.forLearner('other').problem('stacks-push')).build.language).toBe('python');
		expect((await mine.problem('stacks-push')).build.language).toBe('typescript');
	});

	it('runs the Build in the current Language', async () => {
		const { learner, runner } = await setup();
		await learner.switchLanguage('stacks-push', 'typescript');

		await learner.run(ref('stacks-push', 0, 'typescript'), { 'main.ts': 'console.log(2)' });

		expect(runner.calls[0].language).toBe('typescript');
	});

	it('records a Submission in the current Language', async () => {
		const { learner, db } = await setup();
		await learner.switchLanguage('stacks-push', 'typescript');

		await learner.submit(ref('stacks-push', 0, 'typescript'), { 'main.ts': 'console.log(2)' });

		expect((await db.submission.findFirstOrThrow()).language).toBe('typescript');
	});

	it('throws NotFound for an unknown Topic and TopicLocked for a Locked one', async () => {
		const { learner } = await setup();

		await expect(learner.switchLanguage('nope', 'typescript')).rejects.toMatchObject({
			code: 'NotFound'
		});
		await expect(learner.switchLanguage('queues-enqueue', 'typescript')).rejects.toMatchObject({
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
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'python v1' });
		await learner.switchLanguage('stacks-push', 'typescript');
		await learner.saveCode(ref('stacks-push', 0, 'typescript'), { 'main.ts': 'ts v1' });
		return { learner, runner, db };
	}

	it('refuses a stale-Language save and leaves both Builds untouched', async () => {
		const { learner, db } = await setup();

		await expect(
			learner.saveCode(ref('stacks-push', 1), { 'main.py': 'python v2' })
		).rejects.toMatchObject({ code: 'RevisionConflict' });

		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.ts': 'ts v1' });
		const python = await db.buildStep.findMany({ where: { language: 'python' } });
		expect(python.map((r) => [r.files, r.revision])).toEqual([[{ 'main.py': 'python v1' }, 1]]);
	});

	it('refuses a stale-Language run: nothing saved, nothing executed', async () => {
		const { learner, runner } = await setup();

		await expect(
			learner.run(ref('stacks-push', 1), { 'main.py': 'python v2' })
		).rejects.toMatchObject({ code: 'RevisionConflict' });

		expect(runner.calls).toHaveLength(0);
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.ts': 'ts v1' });
	});

	it('refuses a stale-Language submit: no Submission, nothing executed', async () => {
		const { learner, runner, db } = await setup();

		await expect(
			learner.submit(ref('stacks-push', 1), { 'main.py': 'python v2' })
		).rejects.toMatchObject({ code: 'RevisionConflict' });

		expect(runner.calls).toHaveLength(0);
		expect(await db.submission.count()).toBe(0);
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.ts': 'ts v1' });
	});

	it('refuses a stale-Language first save too, creating no Build', async () => {
		const { learner, db } = await setup();

		await expect(
			learner.saveCode(ref('stacks-pop', 0), { 'main.py': 'late' })
		).rejects.toMatchObject({ code: 'RevisionConflict' });

		expect(await db.buildStep.count({ where: { problemId: 'stacks-pop' } })).toBe(0);
	});

	it('still saves, runs and submits in the current Language', async () => {
		const { learner, runner } = await setup();

		expect(
			await learner.saveCode(ref('stacks-push', 1, 'typescript'), { 'main.ts': 'ts v2' })
		).toEqual({
			revision: 2
		});
		await learner.run(ref('stacks-push', 2, 'typescript'), { 'main.ts': 'ts v3' });
		const view = await learner.submit(ref('stacks-push', 3, 'typescript'), { 'main.ts': 'ts v4' });

		expect(view.revision).toBe(4);
		expect(runner.calls.every((c) => c.language === 'typescript')).toBe(true);
	});
});

describe('progress events racing on a file database', () => {
	it('credit each effect to exactly one caller: a Chapter read once, a Topic completed once', async () => {
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
		// Runner calls are held until the racing submits are all in flight, so their database
		// steps start together and interleave.
		let hold: { waiting: number; of: number; release: () => void; gate: Promise<void> } | undefined;
		const runner = {
			...inner,
			async execute(request: Parameters<typeof inner.execute>[0]) {
				if (hold && ++hold.waiting >= hold.of) hold.release();
				await hold?.gate;
				return inner.execute(request);
			}
		};
		const core = createLearningCore({ catalogue, db: await createFileTestDb(), runner });

		// Two reads of the same Chapter: exactly one is the read that completes the Topic.
		const reader = core.forLearner('reader');
		await reader.reachChapterEnd('stacks-undo-log');
		await reader.submit(ref('stacks-push', 0), { 'main.py': 'x' });
		await reader.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
		const reads = await Promise.all([
			reader.reachChapterEnd('stacks-call-frames'),
			reader.reachChapterEnd('stacks-call-frames')
		]);
		expect(reads.filter((r) => r.topicCompleted)).toHaveLength(1);
		expect((await reader.topic('stacks')).counts.chaptersRead).toBe(2);

		// Two submits: only the one that completes the Topic reports topicCompleted.
		const solver = core.forLearner('solver');
		await solver.reachChapterEnd('stacks-undo-log');
		await solver.reachChapterEnd('stacks-call-frames');
		await solver.submit(ref('stacks-push', 0), { 'main.py': 'x' });
		let release: () => void = () => {};
		hold = {
			waiting: 0,
			of: 2,
			release: () => release(),
			gate: new Promise<void>((r) => (release = r))
		};
		const [extra, completing] = await Promise.all([
			solver.submit(ref('stacks-peek', 0), { 'main.py': 'x' }),
			solver.submit(ref('stacks-pop', 0), { 'main.py': 'x' })
		]);
		expect(completing.accepted?.topicCompleted).toBe(true);
		expect(extra.accepted?.topicCompleted).toBe(false);
	});
});

describe('Hints', () => {
	async function setup(db?: Awaited<ReturnType<typeof createTestDb>>) {
		const catalogue = await loadCatalogue(fixtureDir);
		const core = createLearningCore({ catalogue, db: db ?? (await createTestDb()) });
		return { catalogue, core };
	}

	it('starts with nothing revealed: the count and the Chapter to link to, no hint text', async () => {
		const { core } = await setup();

		const view = await core.forLearner('l').hints('stacks-push');

		expect(view).toEqual({
			total: 2,
			revealed: [],
			chapter: { id: 'stacks-undo-log', title: 'An undo log' }
		});
		expect(JSON.stringify(view)).not.toContain('hint.');
	});

	it('reveals one Hint per call, in number order, rendered as Markdown', async () => {
		const { core } = await setup();
		const learner = core.forLearner('l');

		const first = await learner.revealHint('stacks-push');
		expect(first.total).toBe(2);
		expect(first.revealed).toHaveLength(1);
		expect(first.revealed[0]?.number).toBe(1);
		expect(first.revealed[0]?.html).toContain('<p>First hint.');

		const second = await learner.revealHint('stacks-push');
		expect(second.revealed.map((h) => h.number)).toEqual([1, 2]);
		expect(second.revealed[1]?.html).toContain('<p>Second hint.');
	});

	it('remembers what was revealed, per Learner and per Problem', async () => {
		const { core } = await setup();
		await core.forLearner('a').revealHint('stacks-push');
		await core.forLearner('a').revealHint('stacks-push');

		expect((await core.forLearner('a').hints('stacks-push')).revealed).toHaveLength(2);
		expect((await core.forLearner('b').hints('stacks-push')).revealed).toHaveLength(0);
		expect((await core.forLearner('a').hints('stacks-peek')).revealed).toHaveLength(0);
	});

	it('never sends an unrevealed Hint: its text is absent from the view', async () => {
		const { core } = await setup();
		const learner = core.forLearner('l');
		await learner.revealHint('stacks-push');

		expect(JSON.stringify(await learner.hints('stacks-push'))).not.toContain('Second hint');
	});

	it('answers a reveal past the last Hint with the Hints already revealed, unchanged', async () => {
		const { core } = await setup();
		const learner = core.forLearner('l');
		await learner.revealHint('stacks-push');
		const last = await learner.revealHint('stacks-push');

		expect(await learner.revealHint('stacks-push')).toEqual(last);
		expect((await learner.hints('stacks-push')).revealed).toHaveLength(2);
	});

	it('answers a Problem with no Hints with total 0, and a reveal changes nothing', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const bare = {
			...catalogue,
			problem: (id: string) => {
				const problem = catalogue.problem(id);
				return problem && { ...problem, hints: [] };
			}
		};
		const learner = createLearningCore({ catalogue: bare, db: await createTestDb() }).forLearner(
			'l'
		);

		expect((await learner.hints('stacks-push')).total).toBe(0);
		expect((await learner.revealHint('stacks-push')).total).toBe(0);
	});

	it('two reveals at once never go past the count, and a lone pair raises it by two', async () => {
		const { core } = await setup(await createFileTestDb());
		const learner = core.forLearner('l');

		await Promise.all([learner.revealHint('stacks-push'), learner.revealHint('stacks-push')]);
		expect((await learner.hints('stacks-push')).revealed).toHaveLength(2);

		const settled = await Promise.all([
			learner.revealHint('stacks-push'),
			learner.revealHint('stacks-push'),
			learner.revealHint('stacks-push')
		]);
		expect(settled.every((view) => view.revealed.length === 2)).toBe(true);
		expect((await learner.hints('stacks-push')).revealed).toHaveLength(2);
	});

	it('refuses a Locked Topic and an unknown Problem', async () => {
		const { core } = await setup();
		const learner = core.forLearner('l');

		await expect(learner.hints('queues-enqueue')).rejects.toMatchObject({ code: 'TopicLocked' });
		await expect(learner.revealHint('queues-enqueue')).rejects.toMatchObject({
			code: 'TopicLocked'
		});
		await expect(learner.hints('nope')).rejects.toMatchObject({ code: 'NotFound' });
		await expect(learner.revealHint('nope')).rejects.toMatchObject({ code: 'NotFound' });
	});

	it('reveals and reads write no progress', async () => {
		const { core } = await setup();
		const learner = core.forLearner('l');
		const before = await learner.map();
		await learner.revealHint('stacks-push');

		expect(await learner.map()).toEqual(before);
		expect((await learner.problem('stacks-push')).status).toBe('Untouched');
	});
});

describe('learner.solution()', () => {
	async function setup() {
		const catalogue = await loadCatalogue(fixtureDir);
		const core = createLearningCore({ catalogue, db: await createTestDb() });
		return { catalogue, core };
	}

	it('gives the explanation as HTML and the Reference Code after the Problem in every Language', async () => {
		const { catalogue, core } = await setup();

		const view = await core.forLearner('l').solution('stacks-push');

		expect(view.explanationHtml).toContain('<p>Placeholder fixture text');
		expect(view.referenceCode).toEqual(catalogue.problem('stacks-push')?.referenceCode);
		expect(Object.keys(view.referenceCode)).toEqual(['python', 'typescript', 'go']);
	});

	it('keeps every file of a multi-file Reference Code, entry file first as authored', async () => {
		const { catalogue } = await setup();
		const multi = {
			...catalogue,
			problem: (id: string) => {
				const problem = catalogue.problem(id);
				return (
					problem && {
						...problem,
						referenceCode: {
							...problem.referenceCode,
							python: { 'main.py': 'import helpers', 'helpers.py': 'x = 1' }
						}
					}
				);
			}
		};
		const learner = createLearningCore({ catalogue: multi, db: await createTestDb() }).forLearner(
			'l'
		);

		const view = await learner.solution('stacks-push');

		expect(Object.keys(view.referenceCode.python)).toEqual(['main.py', 'helpers.py']);
	});

	it('is always available, solved or not, and changes no progress or Build', async () => {
		const { core } = await setup();
		const learner = core.forLearner('l');
		const before = { map: await learner.map(), problem: await learner.problem('stacks-push') };

		await learner.solution('stacks-push');

		expect({ map: await learner.map(), problem: await learner.problem('stacks-push') }).toEqual(
			before
		);
		expect(before.problem.status).toBe('Untouched');
	});

	it('is not part of the Problem view', async () => {
		const { core } = await setup();

		const problem = await core.forLearner('l').problem('stacks-push');

		expect(Object.keys(problem)).not.toContain('solution');
		expect(Object.keys(problem)).not.toContain('referenceCode');
	});

	it('refuses a Locked Topic and an unknown Problem', async () => {
		const { core } = await setup();
		const learner = core.forLearner('l');

		await expect(learner.solution('queues-enqueue')).rejects.toMatchObject({
			code: 'TopicLocked'
		});
		await expect(learner.solution('nope')).rejects.toMatchObject({ code: 'NotFound' });
	});
});

describe('learner.startFromReferenceCode()', () => {
	async function setup() {
		const catalogue = await loadCatalogue(fixtureDir);
		// Every Test answers correctly, so a Submit is Accepted whatever the code.
		const tests: NonNullable<RunnerScript['tests']> = {};
		for (const p of ['stacks-push', 'stacks-pop', 'stacks-peek']) {
			for (const t of [
				...(catalogue.problem(p)?.exampleTests ?? []),
				...(catalogue.hiddenTests(p) ?? [])
			])
				tests[t.id] = { status: 'ok', stdout: t.expected };
		}
		const db = await createTestDb();
		const core = createLearningCore({ catalogue, db, runner: createScriptedRunner({ tests }) });
		return { catalogue, db, learner: core.forLearner('any-learner') };
	}

	it('answers a retried restart whose reply was lost as started, at the same revision', async () => {
		const { learner, db } = await setup();
		const broken = await learner.saveCode(ref('stacks-pop', 0), { 'main.py': 'broken' });
		const first = await learner.startFromReferenceCode(ref('stacks-pop', broken.revision));
		const before = await db.buildStep.findMany();

		const retried = await learner.startFromReferenceCode(ref('stacks-pop', broken.revision));

		expect(retried).toEqual(first);
		expect(await db.buildStep.findMany()).toEqual(before);
	});

	it("replaces the Learner's Build with the Reference Code after the previous Problem", async () => {
		const { learner, catalogue } = await setup();
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'mine' });
		const broken = await learner.saveCode(ref('stacks-pop', 0), { 'main.py': 'broken' });

		const started = await learner.startFromReferenceCode(ref('stacks-pop', broken.revision));

		const reference = catalogue.problem('stacks-push')?.referenceCode.python;
		expect(started).toEqual({ files: reference, revision: broken.revision + 1 });
		expect(await learner.problem('stacks-pop')).toMatchObject({
			build: { problemId: 'stacks-pop', language: 'python', revision: broken.revision + 1 },
			files: reference
		});
		// Only this step: the previous Problem keeps the Learner's own code.
		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.py': 'mine' });
	});

	it('works on a step never saved, and a Submit with the new revision is accepted by the core', async () => {
		const { learner, catalogue } = await setup();

		const started = await learner.startFromReferenceCode(ref('stacks-pop', 0));
		expect(started.revision).toBe(1);

		const view = await learner.submit(ref('stacks-pop', started.revision), started.files);
		expect(view).toMatchObject({ verdict: 'Accepted' });
		expect(started.files).toEqual(catalogue.problem('stacks-push')?.referenceCode.python);
	});

	it("starts a Topic's first Problem empty", async () => {
		const { learner } = await setup();
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'mine' });

		const started = await learner.startFromReferenceCode(ref('stacks-push', 1));

		expect(started).toEqual({ files: { 'main.py': '' }, revision: 2 });
	});

	it('uses the Language of the Build, and an Extra starts from its parent', async () => {
		const { learner, catalogue } = await setup();
		await learner.switchLanguage('stacks-push', 'typescript');

		const started = await learner.startFromReferenceCode(ref('stacks-peek', 0, 'typescript'));

		expect(started.files).toEqual(catalogue.problem('stacks-push')?.referenceCode.typescript);
	});

	it('goes through the same revision check as a save', async () => {
		const { learner } = await setup();
		await learner.saveCode(ref('stacks-pop', 0), { 'main.py': 'a' });

		await expect(learner.startFromReferenceCode(ref('stacks-pop', 0))).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		await expect(
			learner.startFromReferenceCode(ref('stacks-pop', 1, 'typescript'))
		).rejects.toMatchObject({ code: 'RevisionConflict' });
		expect((await learner.problem('stacks-pop')).files).toEqual({ 'main.py': 'a' });
	});

	it('refuses a Locked Topic and an unknown Problem', async () => {
		const { learner } = await setup();

		await expect(learner.startFromReferenceCode(ref('queues-enqueue', 0))).rejects.toMatchObject({
			code: 'TopicLocked'
		});
		await expect(learner.startFromReferenceCode(ref('nope', 0))).rejects.toMatchObject({
			code: 'NotFound'
		});
	});

	it('keeps the Submissions and changes no progress or Hint', async () => {
		const { learner, db } = await setup();
		await learner.revealHint('stacks-pop');
		const view = await learner.submit(ref('stacks-pop', 0), { 'main.py': 'x' });
		const before = {
			submissions: await db.submission.findMany(),
			status: (await learner.problem('stacks-pop')).status,
			hints: await learner.hints('stacks-pop'),
			map: await learner.map()
		};

		await learner.startFromReferenceCode(ref('stacks-pop', view.revision));

		expect(await db.submission.findMany()).toEqual(before.submissions);
		expect((await learner.problem('stacks-pop')).status).toBe(before.status);
		expect(await learner.hints('stacks-pop')).toEqual(before.hints);
		expect(await learner.map()).toEqual(before.map);
	});
});

describe('the autosave read', () => {
	async function setup() {
		const catalogue = await loadCatalogue(fixtureDir);
		const core = createLearningCore({ catalogue, db: await createTestDb() });
		return core.forLearner('any-learner');
	}

	it('renders no Markdown on saveCode, nor on Start from reference code', async () => {
		const learner = await setup();
		await learner.problem('stacks-pop'); // the screen read does render
		expect(rendered.calls).toBeGreaterThan(0);

		rendered.calls = 0;
		const saved = await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'a' });
		await learner.saveCode(ref('stacks-push', saved.revision), { 'main.py': 'b' });
		await learner.startFromReferenceCode(ref('stacks-pop', 0));
		expect(rendered.calls).toBe(0);
	});

	it('still answers NotFound and TopicLocked, on a save and on a restart', async () => {
		const learner = await setup();
		await expect(learner.saveCode(ref('nope', 0), { 'main.py': '' })).rejects.toMatchObject({
			code: 'NotFound'
		});
		await expect(learner.startFromReferenceCode(ref('nope', 0))).rejects.toMatchObject({
			code: 'NotFound'
		});
		// queues needs stacks first
		const locked = ref('queues-enqueue', 0);
		await expect(learner.saveCode(locked, { 'main.py': '' })).rejects.toMatchObject({
			code: 'TopicLocked'
		});
		await expect(learner.startFromReferenceCode(locked)).rejects.toMatchObject({
			code: 'TopicLocked'
		});
	});
});

describe('one Build rule for the Learning core and the Runner (C78)', () => {
	const tooMany = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`f${i}.py`, '']));
	const shapes = [
		['a path over 94 bytes', { [`${'a'.repeat(92)}.py`]: 'x' }],
		['a path containing a null byte', { 'main\0.py': 'x' }],
		['more than 64 files', tooMany],
		['a file under another file', { a: 'x', 'a/b': 'x' }],
		['lone surrogates in paths', { 'main.py': 'x', 'x\ud800': '1', 'x\udc00/y': '2' }]
	] as const;

	async function setup() {
		const runner = createScriptedRunner();
		const db = await createTestDb();
		const core = createLearningCore({ catalogue: await loadCatalogue(fixtureDir), db, runner });
		return { runner, learner: core.forLearner('any-learner') };
	}

	it.each(shapes)('refuses %s on run, submit and save, and stores nothing', async (_n, files) => {
		const { learner, runner } = await setup();
		const build = ref('stacks-push', 0);
		for (const act of [learner.run, learner.submit, learner.saveCode]) {
			await expect(act(build, files)).rejects.toMatchObject({ code: 'InvalidBuild' });
		}
		expect((await learner.problem('stacks-push')).build.revision).toBe(0);
		expect(runner.calls).toEqual([]);
	});

	it.each(shapes)('has the scripted Runner refuse %s too', async (_n, files) => {
		const request = {
			language: 'python' as const,
			files: { ...files },
			tests: [],
			limits: { timeoutMs: 1000, memoryMb: 64 }
		};
		await expect(createScriptedRunner().execute(request)).rejects.toThrow(/Invalid Build/);
	});

	it('accepts a path of exactly 94 bytes and exactly 64 files', async () => {
		const { learner } = await setup();
		const files = Object.fromEntries(Array.from({ length: 63 }, (_, i) => [`f${i}.py`, '']));
		files[`${'a'.repeat(91)}.py`] = 'x';
		await expect(learner.saveCode(ref('stacks-push', 0), files)).resolves.toEqual({ revision: 1 });
	});
});

describe('a keepalive save on top of the tab own unconfirmed save (C69)', () => {
	async function setup() {
		const catalogue = await loadCatalogue(fixtureDir);
		const core = createLearningCore({ catalogue, db: await createTestDb() });
		const learner = core.forLearner('any-learner');
		await learner.saveCode(ref('stacks-push', 0), { 'main.py': 'v1' }); // head is revision 1
		return learner;
	}
	const A = { 'main.py': 'v2' }; // the save in flight
	const B = { 'main.py': 'v3' }; // the keepalive save, with more typing
	const digestOfA = () => filesDigest(A);

	it('stores the keepalive save when the in-flight save lands first', async () => {
		const learner = await setup();

		expect(await learner.saveCode(ref('stacks-push', 1), A)).toEqual({ revision: 2 });
		expect(await learner.saveCode(ref('stacks-push', 1), B, await digestOfA())).toEqual({
			revision: 3
		});

		expect((await learner.problem('stacks-push')).files).toEqual(B);
		expect((await learner.problem('stacks-push')).build.revision).toBe(3);
	});

	it('stores the keepalive save when it lands first, and the in-flight save then conflicts', async () => {
		const learner = await setup();

		expect(await learner.saveCode(ref('stacks-push', 1), B, await digestOfA())).toEqual({
			revision: 2
		});
		await expect(learner.saveCode(ref('stacks-push', 1), A)).rejects.toMatchObject({
			code: 'RevisionConflict'
		});

		expect((await learner.problem('stacks-push')).files).toEqual(B);
		expect((await learner.problem('stacks-push')).build.revision).toBe(2);
	});

	it('refuses a digest that does not match the stored head, for example another tab save', async () => {
		const learner = await setup();
		await learner.saveCode(ref('stacks-push', 1), { 'main.py': 'other tab' });

		await expect(
			learner.saveCode(ref('stacks-push', 1), B, await digestOfA())
		).rejects.toMatchObject({ code: 'RevisionConflict' });

		expect((await learner.problem('stacks-push')).files).toEqual({ 'main.py': 'other tab' });
	});

	it('still refuses a save two or more behind, whatever the digest', async () => {
		const learner = await setup();
		await learner.saveCode(ref('stacks-push', 1), A);
		await learner.saveCode(ref('stacks-push', 2), B);

		await expect(
			learner.saveCode(ref('stacks-push', 1), { 'main.py': 'v4' }, await filesDigest(B))
		).rejects.toMatchObject({ code: 'RevisionConflict' });
	});

	it('keeps the identical-retry rule: a retry of the stored head is answered as saved', async () => {
		const learner = await setup();
		await learner.saveCode(ref('stacks-push', 1), A);

		expect(await learner.saveCode(ref('stacks-push', 1), A)).toEqual({ revision: 2 });
		expect((await learner.problem('stacks-push')).build.revision).toBe(2);
	});
});

describe('one Learner has at most maxRunsPerLearner Runs and Submits running', () => {
	/** A Runner whose calls each wait for `finishOne`, so a test decides when a Run or Submit ends. */
	function gatedRunner(failWith?: Error) {
		const pending: { resolve: () => void; reject: (e: Error) => void }[] = [];
		return {
			execute: (request: { tests: readonly { id: string }[] }) =>
				new Promise<ExecuteResult>((resolve, reject) => {
					pending.push({
						resolve: () =>
							resolve({
								results: request.tests.map(({ id }) => ({
									id,
									status: 'ok' as const,
									stdout: '',
									stderr: ''
								}))
							}),
						reject
					});
				}),
			inFlight: () => pending.length,
			finishOne: () => pending.shift()?.resolve(),
			failOne: (e = failWith ?? new Error('down')) => pending.shift()?.reject(e)
		};
	}
	async function setup(cap = 2) {
		const runner = gatedRunner();
		const db = await createTestDb();
		const core = createLearningCore({
			catalogue: await loadCatalogue(fixtureDir),
			db,
			runner,
			maxRunsPerLearner: cap
		});
		return { runner, db, core };
	}
	const tick = () => new Promise((r) => setTimeout(r, 20));

	it('refuses one past the cap as RunnerUnavailable, counting Runs and Submits together, saving but recording nothing', async () => {
		const { runner, db, core } = await setup(2);
		const a = core.forLearner('ann');
		const run = a.run(ref('stacks-push', 0), { 'main.py': '1' });
		await tick();
		const submit = a.submit(ref('stacks-push', 1), { 'main.py': '2' });
		await tick();

		await expect(a.run(ref('stacks-push', 2), { 'main.py': '3' })).rejects.toMatchObject({
			code: 'RunnerUnavailable',
			revision: 3
		});
		await expect(a.submit(ref('stacks-push', 3), { 'main.py': '4' })).rejects.toMatchObject({
			code: 'RunnerUnavailable',
			revision: 4
		});
		expect(runner.inFlight()).toBe(2);
		expect(await db.submission.count()).toBe(0);
		// a Submit makes several Runner calls in a row: keep answering until both end
		for (let i = 0; i < 6; i++) {
			runner.finishOne();
			await tick();
		}
		await Promise.allSettled([run, submit]);
	});

	it('counts each Learner on their own, across every forLearner view', async () => {
		const { runner, core } = await setup(1);
		const first = core.forLearner('ann').run(ref('stacks-push', 0), { 'main.py': '1' });
		await tick();

		const other = core.forLearner('bob').run(ref('stacks-push', 0), { 'main.py': '1' });
		await expect(
			core.forLearner('ann').run(ref('stacks-push', 1), { 'main.py': '2' })
		).rejects.toMatchObject({ code: 'RunnerUnavailable' });
		await tick();
		expect(runner.inFlight()).toBe(2);
		runner.finishOne();
		runner.finishOne();
		await Promise.all([first, other]);
	});

	it('frees the cap when a Run finishes', async () => {
		const { runner, core } = await setup(1);
		const a = core.forLearner('ann');
		const first = a.run(ref('stacks-push', 0), { 'main.py': '1' });
		await tick();
		runner.finishOne();
		await first;

		const second = a.run(ref('stacks-push', 1), { 'main.py': '2' });
		await tick();
		expect(runner.inFlight()).toBe(1);
		runner.finishOne();
		await second;
	});

	it('frees the cap when a Submit finishes with a Verdict', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const correct: NonNullable<RunnerScript['tests']> = {};
		for (const t of [
			...(catalogue.problem('stacks-push')?.exampleTests ?? []),
			...(catalogue.hiddenTests('stacks-push') ?? [])
		])
			correct[t.id] = { status: 'ok', stdout: t.expected };
		const a = createLearningCore({
			catalogue,
			db: await createTestDb(),
			runner: createScriptedRunner({ tests: correct }),
			maxRunsPerLearner: 1
		}).forLearner('ann');

		expect(await a.submit(ref('stacks-push', 0), { 'main.py': '1' })).toMatchObject({
			verdict: 'Accepted'
		});
		expect(await a.submit(ref('stacks-push', 1), { 'main.py': '2' })).toMatchObject({
			verdict: 'Accepted'
		});
	});

	it('frees the cap when the Runner fails mid-Run or mid-Submit', async () => {
		const { runner, core } = await setup(1);
		const a = core.forLearner('ann');
		const run = a.run(ref('stacks-push', 0), { 'main.py': '1' });
		await tick();
		runner.failOne();
		await expect(run).rejects.toMatchObject({ code: 'RunnerUnavailable' });

		const submit = a.submit(ref('stacks-push', 1), { 'main.py': '2' });
		await tick();
		runner.failOne();
		await expect(submit).rejects.toMatchObject({ code: 'RunnerUnavailable' });

		const after = a.run(ref('stacks-push', 2), { 'main.py': '3' });
		await tick();
		expect(runner.inFlight()).toBe(1);
		runner.finishOne();
		await after;
	});

	it('frees the cap when the Run or Submit throws something that is not a Runner error', async () => {
		const { runner, core } = await setup(1);
		const a = core.forLearner('ann');
		const run = a.run(ref('stacks-push', 0), { 'main.py': '1' });
		await tick();
		runner.failOne(new TypeError('boom'));
		await expect(run).rejects.toBeDefined();

		const after = a.run(ref('stacks-push', 1), { 'main.py': '2' });
		await tick();
		expect(runner.inFlight()).toBe(1);
		runner.finishOne();
		await after;
	});

	it('does not hold the cap for a save conflict or a refusal before the Runner', async () => {
		const { runner, core } = await setup(1);
		const a = core.forLearner('ann');
		await expect(a.run(ref('stacks-push', 5), { 'main.py': '1' })).rejects.toMatchObject({
			code: 'RevisionConflict'
		});
		await expect(a.submit(ref('queues-enqueue', 0), { 'main.py': '1' })).rejects.toMatchObject({
			code: 'TopicLocked'
		});

		const ok = a.run(ref('stacks-push', 0), { 'main.py': '1' });
		await tick();
		expect(runner.inFlight()).toBe(1);
		runner.finishOne();
		await ok;
	});

	it('frees the cap when the Runner is missing', async () => {
		const core = createLearningCore({
			catalogue: await loadCatalogue(fixtureDir),
			db: await createTestDb(),
			maxRunsPerLearner: 1
		});
		const a = core.forLearner('ann');
		for (const revision of [0, 1, 2])
			await expect(a.run(ref('stacks-push', revision), { 'main.py': 'x' })).rejects.toMatchObject({
				code: 'RunnerUnavailable'
			});
	});
});
