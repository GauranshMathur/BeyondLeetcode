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
