import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { type Catalogue, ContentError, loadCatalogue } from './catalogue.ts';

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

describe('malformed content', () => {
	const copies: string[] = [];
	afterAll(() => Promise.all(copies.map((d) => rm(d, { recursive: true, force: true }))));

	/** A fresh copy of the fixture, broken by `mutate`, then loaded. */
	async function loadBroken(mutate: (dir: string) => Promise<unknown>): Promise<Catalogue> {
		const dir = await mkdtemp(join(tmpdir(), 'content-'));
		copies.push(dir);
		await cp(fixtureDir, dir, { recursive: true });
		await mutate(dir);
		return loadCatalogue(dir);
	}

	async function editJson(path: string, edit: (json: Record<string, unknown>) => void) {
		const json = JSON.parse(await readFile(path, 'utf8'));
		edit(json);
		await writeFile(path, JSON.stringify(json));
	}

	const stacks = (dir: string) => join(dir, 'topics/stacks');
	const pushProblem = (dir: string) =>
		join(stacks(dir), 'chapters/stacks-undo-log/problems/stacks-push');

	it('rejects a manifest that is not JSON', async () => {
		await expect(
			loadBroken((dir) => writeFile(join(stacks(dir), 'topic.json'), '{ "title": '))
		).rejects.toThrow(/topics\/stacks\/topic\.json: not valid JSON/);
	});

	it('rejects a manifest missing a field', async () => {
		await expect(
			loadBroken((dir) => editJson(join(stacks(dir), 'topic.json'), (t) => delete t.title))
		).rejects.toThrow(/topics\/stacks\/topic\.json: .*expected string.*\n.*at title/);
	});

	it('rejects a manifest with an unknown key', async () => {
		await expect(
			loadBroken((dir) =>
				editJson(join(pushProblem(dir), 'problem.json'), (p) => {
					p.difficulty = 'easy';
				})
			)
		).rejects.toThrow(/stacks-push\/problem\.json: .*Unrecognized key: "difficulty"/);
	});

	it('rejects an id that is not a slug', async () => {
		await expect(
			loadBroken((dir) =>
				editJson(join(dir, 'content.json'), (c) => {
					c.topics = ['stacks', 'queues', 'heaps', 'Bad Id'];
				})
			)
		).rejects.toThrow(/content\.json: .*lowercase slug/);
	});

	it('rejects a manifest listing an id with no folder', async () => {
		await expect(
			loadBroken((dir) =>
				editJson(join(stacks(dir), 'topic.json'), (t) => {
					t.chapters = ['stacks-undo-log', 'stacks-call-frames', 'stacks-ghost'];
				})
			)
		).rejects.toThrow(/topics\/stacks\/chapters\/stacks-ghost\/chapter\.json: missing file/);
	});

	it('rejects a folder its manifest does not list', async () => {
		await expect(
			loadBroken((dir) =>
				editJson(join(stacks(dir), 'chapters/stacks-undo-log/chapter.json'), (c) => {
					c.problems = ['stacks-push'];
				})
			)
		).rejects.toThrow(
			/stacks-undo-log\/problems: folder "stacks-peek" is not listed in chapter\.json/
		);
	});

	it('rejects an id used twice', async () => {
		await expect(
			loadBroken((dir) =>
				cp(
					join(stacks(dir), 'chapters/stacks-undo-log'),
					join(dir, 'topics/queues/chapters/stacks-undo-log'),
					{
						recursive: true
					}
				).then(() =>
					editJson(join(dir, 'topics/queues/topic.json'), (t) => {
						t.chapters = ['queues-print-spooler', 'stacks-undo-log'];
					})
				)
			)
		).rejects.toThrow(
			/topics\/queues\/chapters\/stacks-undo-log: id "stacks-undo-log" is already used/
		);
	});

	it('rejects a Problem without a Solution', async () => {
		await expect(loadBroken((dir) => rm(join(pushProblem(dir), 'solution.md')))).rejects.toThrow(
			/stacks-push\/solution\.md: missing file/
		);
	});

	it('reports every problem at once, as a ContentError', async () => {
		const error = await loadBroken(async (dir) => {
			await writeFile(join(stacks(dir), 'topic.json'), '{');
			await writeFile(join(dir, 'topics/queues/topic.json'), '{');
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ContentError);
		expect((error as ContentError).issues).toHaveLength(2);
	});
});
