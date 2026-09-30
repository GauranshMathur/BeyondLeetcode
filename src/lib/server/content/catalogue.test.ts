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

	it('gives a Problem with its Example Tests, Hints, Solution and Reference Code', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const problem = catalogue.problem('stacks-pop');

		expect(problem).toMatchObject({
			id: 'stacks-pop',
			topicId: 'stacks',
			chapterId: 'stacks-call-frames',
			title: 'Pop',
			kind: 'core'
		});
		expect(problem?.statement).toMatch(/^Add `pop` to the Build\./);
		expect(problem?.exampleTests).toEqual([
			{
				id: 'stacks-pop/example/01',
				kind: 'example',
				input: 'push 1\npush 2\npop\nsize\n',
				expected: '2\n1\n'
			}
		]);
		expect(problem?.hints.map((h) => h.slice(0, 12))).toEqual(['First hint. ', 'Second hint.']);
		expect(problem?.solution).toMatch(/^Placeholder fixture text/);
		expect(Object.keys(problem?.referenceCode ?? {})).toEqual(['python', 'typescript', 'go']);
		expect(Object.keys(problem?.referenceCode.go ?? {})).toEqual(['main.go']);
		expect(problem?.referenceCode.python['main.py']).toContain('items.pop()');
	});

	it('keeps Hidden Tests out of the Problem and gives them only on request', async () => {
		const catalogue = await loadCatalogue(fixtureDir);

		expect(JSON.stringify(catalogue.problem('stacks-pop'))).not.toContain('push 5');
		expect(catalogue.hiddenTests('stacks-pop')).toEqual([
			{ id: 'stacks-pop/hidden/01', kind: 'hidden', input: 'push 5\npop\n', expected: '5\n' }
		]);
		expect(catalogue.hiddenTests('stacks-peek')).toEqual([]);
	});

	it('gives an Extra Problem its parent Core Problem', async () => {
		const catalogue = await loadCatalogue(fixtureDir);

		expect(catalogue.problem('stacks-peek')).toMatchObject({
			kind: 'extra',
			parent: 'stacks-push'
		});
	});

	it('answers undefined for an unknown id', async () => {
		const catalogue = await loadCatalogue(fixtureDir);

		expect(catalogue.topic('nope')).toBeUndefined();
		expect(catalogue.chapter('nope')).toBeUndefined();
		expect(catalogue.problem('nope')).toBeUndefined();
		expect(catalogue.hiddenTests('nope')).toBeUndefined();
	});

	it('cannot be changed by a caller', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const hints = catalogue.problem('stacks-pop')?.hints as string[];

		expect(() => {
			hints.push('extra');
		}).toThrow(TypeError);
		expect(catalogue.problem('stacks-pop')?.hints).toHaveLength(2);
	});
});
