import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
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

	it('rejects a Test input with no expected output', async () => {
		await expect(
			loadBroken((dir) => rm(join(pushProblem(dir), 'tests/hidden/01.out')))
		).rejects.toThrow(/stacks-push\/tests\/hidden\/01\.out: missing file/);
	});

	it('rejects an expected output with no Test input', async () => {
		await expect(
			loadBroken((dir) => writeFile(join(pushProblem(dir), 'tests/example/02.out'), '1\n'))
		).rejects.toThrow(/stacks-push\/tests\/example\/02\.in: missing file/);
	});

	it('rejects a stray file among the Tests', async () => {
		await expect(
			loadBroken((dir) => writeFile(join(pushProblem(dir), 'tests/example/notes.txt'), ''))
		).rejects.toThrow(/stacks-push\/tests\/example\/notes\.txt: expected a \.in or \.out file/);
	});

	it('rejects a Problem with no Example Test', async () => {
		await expect(
			loadBroken((dir) => rm(join(pushProblem(dir), 'tests/example'), { recursive: true }))
		).rejects.toThrow(/stacks-push\/tests\/example: needs at least one Example Test/);
	});

	it('rejects Hints that skip a number', async () => {
		await expect(loadBroken((dir) => rm(join(pushProblem(dir), 'hints/1.md')))).rejects.toThrow(
			/stacks-push\/hints: Hints must be 1\.md to 1\.md in order, found 2\.md/
		);
	});

	it('rejects a Language missing Reference Code', async () => {
		await expect(
			loadBroken((dir) => rm(join(pushProblem(dir), 'reference/go'), { recursive: true }))
		).rejects.toThrow(/stacks-push\/reference\/go: missing Reference Code/);
	});

	it('rejects Reference Code for an unknown Language', async () => {
		await expect(
			loadBroken((dir) =>
				cp(join(pushProblem(dir), 'reference/go'), join(pushProblem(dir), 'reference/rust'), {
					recursive: true
				})
			)
		).rejects.toThrow(
			/stacks-push\/reference: "rust" is not a Language \(python, typescript, go\)/
		);
	});

	const setPrerequisites = (dir: string, topicId: string, prerequisites: string[]) =>
		editJson(join(dir, 'topics', topicId, 'topic.json'), (t) => {
			t.prerequisites = prerequisites;
		});

	it('rejects a Prerequisite that is not a Topic', async () => {
		await expect(
			loadBroken((dir) => setPrerequisites(dir, 'queues', ['stacks', 'tries']))
		).rejects.toThrow(/topics\/queues\/topic\.json: Prerequisite "tries" is not a Topic/);
	});

	it('rejects a Topic that is its own Prerequisite', async () => {
		await expect(loadBroken((dir) => setPrerequisites(dir, 'stacks', ['stacks']))).rejects.toThrow(
			/Prerequisites form a cycle: stacks -> stacks/
		);
	});

	it('rejects cyclic Prerequisites', async () => {
		await expect(loadBroken((dir) => setPrerequisites(dir, 'stacks', ['heaps']))).rejects.toThrow(
			/Prerequisites form a cycle: stacks -> heaps -> (queues -> )?stacks/
		);
	});

	const setParent = (dir: string, parent: string) =>
		editJson(
			join(stacks(dir), 'chapters/stacks-undo-log/problems/stacks-peek/problem.json'),
			(p) => {
				p.parent = parent;
			}
		);

	it('rejects an Extra whose parent is not a Problem', async () => {
		await expect(loadBroken((dir) => setParent(dir, 'stacks-ghost'))).rejects.toThrow(
			/stacks-peek\/problem\.json: parent "stacks-ghost" is not a Core Problem before it in Topic "stacks"/
		);
	});

	it('rejects an Extra whose parent is in another Topic', async () => {
		await expect(loadBroken((dir) => setParent(dir, 'queues-enqueue'))).rejects.toThrow(
			/parent "queues-enqueue" is not a Core Problem before it in Topic "stacks"/
		);
	});

	it('rejects an Extra whose parent comes after it', async () => {
		await expect(loadBroken((dir) => setParent(dir, 'stacks-pop'))).rejects.toThrow(
			/parent "stacks-pop" is not a Core Problem before it/
		);
	});

	it('rejects an Extra whose parent is an Extra', async () => {
		await expect(loadBroken((dir) => setParent(dir, 'stacks-peek'))).rejects.toThrow(
			/parent "stacks-peek" is not a Core Problem before it/
		);
	});

	it.each([
		['chapter.md', 'topics/stacks/chapters/stacks-undo-log/chapter.md'],
		['statement.md', 'topics/stacks/chapters/stacks-undo-log/problems/stacks-push/statement.md'],
		['solution.md', 'topics/stacks/chapters/stacks-undo-log/problems/stacks-push/solution.md'],
		['a Hint', 'topics/stacks/chapters/stacks-undo-log/problems/stacks-push/hints/2.md']
	])('rejects a blank %s', async (_name, path) => {
		await expect(loadBroken((dir) => writeFile(join(dir, path), ' \n'))).rejects.toThrow(
			new RegExp(`${path.replace(/[.]/g, '\\.')}: must not be empty`)
		);
	});

	it('allows a Test with empty input and empty expected output', async () => {
		const catalogue = await loadBroken(async (dir) => {
			await writeFile(join(pushProblem(dir), 'tests/hidden/02.in'), '');
			await writeFile(join(pushProblem(dir), 'tests/hidden/02.out'), '');
		});

		expect(catalogue.hiddenTests('stacks-push')?.map((t) => t.id)).toContain(
			'stacks-push/hidden/02'
		);
	});

	it('rejects a folder among the Tests or Hints', async () => {
		await expect(
			loadBroken((dir) => mkdir(join(pushProblem(dir), 'tests/example/extra')))
		).rejects.toThrow(/stacks-push\/tests\/example: unexpected folder "extra"/);
		await expect(loadBroken((dir) => mkdir(join(pushProblem(dir), 'hints/extra')))).rejects.toThrow(
			/stacks-push\/hints: unexpected folder "extra"/
		);
	});

	it('names a stray file among the Hints', async () => {
		await expect(
			loadBroken((dir) => writeFile(join(pushProblem(dir), 'hints/notes.txt'), 'x'))
		).rejects.toThrow(/stacks-push\/hints\/notes\.txt: expected a numbered Hint like 1\.md/);
	});

	it('does not blame an Extra for its parent when the parent failed to load', async () => {
		const error = await loadBroken((dir) =>
			writeFile(join(pushProblem(dir), 'problem.json'), '{')
		).catch((e: unknown) => e);

		expect((error as ContentError).issues).toHaveLength(1);
		expect((error as ContentError).issues[0]).toMatch(/stacks-push\/problem\.json: not valid JSON/);
	});

	it('accepts an Extra that branches from an older Core Problem', async () => {
		const catalogue = await loadBroken(async (dir) => {
			// Move the Extra after the second Core Problem, still branching from the first.
			const extra = 'topics/stacks/chapters/stacks-undo-log/problems/stacks-peek';
			const later = 'topics/stacks/chapters/stacks-call-frames/problems/stacks-peek';
			await rename(join(dir, extra), join(dir, later));
			await editJson(join(dir, 'topics/stacks/chapters/stacks-undo-log/chapter.json'), (c) => {
				c.problems = ['stacks-push'];
			});
			await editJson(join(dir, 'topics/stacks/chapters/stacks-call-frames/chapter.json'), (c) => {
				c.problems = ['stacks-pop', 'stacks-peek'];
			});
		});

		expect(catalogue.topic('stacks')?.mainLine).toEqual(['stacks-push', 'stacks-pop']);
		expect(catalogue.problem('stacks-peek')).toMatchObject({
			chapterId: 'stacks-call-frames',
			parent: 'stacks-push'
		});
	});

	it('keeps nested Reference Code files under `/` paths', async () => {
		const catalogue = await loadBroken(async (dir) => {
			const nested = join(pushProblem(dir), 'reference/python/lib');
			await mkdir(nested);
			await writeFile(join(nested, 'util.py'), 'x = 1\n');
		});

		expect(
			Object.keys(catalogue.problem('stacks-push')?.referenceCode.python ?? {}).sort()
		).toEqual(['lib/util.py', 'main.py']);
	});

	it('rejects ids that are not slugs at Chapter and Problem level', async () => {
		await expect(
			loadBroken((dir) =>
				editJson(join(stacks(dir), 'topic.json'), (t) => {
					t.chapters = ['stacks-undo-log', 'Call_Frames'];
				})
			)
		).rejects.toThrow(/topics\/stacks\/topic\.json: .*lowercase slug/);
		await expect(
			loadBroken((dir) =>
				editJson(join(stacks(dir), 'chapters/stacks-call-frames/chapter.json'), (c) => {
					c.problems = ['Pop'];
				})
			)
		).rejects.toThrow(/stacks-call-frames\/chapter\.json: .*lowercase slug/);
	});

	it('ignores dotfiles such as .DS_Store', async () => {
		const catalogue = await loadBroken((dir) =>
			Promise.all(
				['', 'hints', 'tests/example', 'reference', 'reference/python'].map((sub) =>
					writeFile(join(pushProblem(dir), sub, '.DS_Store'), '')
				)
			)
		);

		expect(Object.keys(catalogue.problem('stacks-push')?.referenceCode.python ?? {})).toEqual([
			'main.py'
		]);
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
