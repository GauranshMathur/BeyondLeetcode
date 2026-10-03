import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
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
