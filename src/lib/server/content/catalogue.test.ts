import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogue } from './catalogue.ts';

const fixtureDir = fileURLToPath(new URL('./fixture', import.meta.url));

describe('fixture content', () => {
	it('lists the Topic Map in order with Prerequisites', async () => {
		const catalogue = await loadCatalogue(fixtureDir);

		expect(catalogue.topicMap().map((t) => [t.id, t.prerequisites])).toEqual([
			['stacks', []],
			['queues', ['stacks']],
			['heaps', ['stacks', 'queues']]
		]);
	});

	it("gives a Topic's Chapters and Problems in order, and its Main Line", async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const stacks = catalogue.topic('stacks');

		expect(stacks?.title).toBe('Stacks');
		expect(
			stacks?.chapters.map((c) => [c.id, c.problems.map((p) => [p.id, p.kind, p.parent])])
		).toEqual([
			[
				'stacks-undo-log',
				[
					['stacks-push', 'core', undefined],
					['stacks-peek', 'extra', 'stacks-push']
				]
			],
			['stacks-call-frames', [['stacks-pop', 'core', undefined]]]
		]);
		expect(stacks?.mainLine).toEqual(['stacks-push', 'stacks-pop']);
	});

	it('gives a Chapter with its Topic and Markdown prose', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const chapter = catalogue.chapter('stacks-call-frames');

		expect(chapter?.topicId).toBe('stacks');
		expect(chapter?.title).toBe('Call frames');
		expect(chapter?.body).toMatch(/^# Call frames\n/);
		expect(chapter?.problems.map((p) => p.id)).toEqual(['stacks-pop']);
	});

	it('answers undefined for an unknown id', async () => {
		const catalogue = await loadCatalogue(fixtureDir);

		expect(catalogue.topic('nope')).toBeUndefined();
		expect(catalogue.chapter('nope')).toBeUndefined();
	});
});
