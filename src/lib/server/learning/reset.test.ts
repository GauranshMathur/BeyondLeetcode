import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
import { createScriptedRunner, type RunnerScript } from '../runner/fake.ts';
import { createTestDb } from '../test-db.ts';
import { createLearningCore } from './core.ts';
import { deleteLearner, PROGRESS_TABLES } from './progress.ts';

const fixtureDir = fileURLToPath(new URL('../content/fixture', import.meta.url));
const schemaPath = fileURLToPath(new URL('../../../../prisma/schema.prisma', import.meta.url));

async function setup() {
	const catalogue = await loadCatalogue(fixtureDir);
	const tests: NonNullable<RunnerScript['tests']> = {};
	for (const t of [
		...(catalogue.problem('stacks-push')?.exampleTests ?? []),
		...(catalogue.hiddenTests('stacks-push') ?? [])
	])
		tests[t.id] = { status: 'ok', stdout: t.expected };
	const db = await createTestDb();
	const core = createLearningCore({ catalogue, db, runner: createScriptedRunner({ tests }) });
	return { db, core };
}

/** Gives a Learner a row in every progress table, through the interface. */
async function makeProgress(
	{ core, db }: Pick<Awaited<ReturnType<typeof setup>>, 'core' | 'db'>,
	id: string
) {
	await db.learner.upsert({ where: { id }, update: {}, create: { id } });
	const learner = core.forLearner(id);
	await learner.reachChapterEnd('stacks-undo-log');
	await learner.revealHint('stacks-push');
	await learner.switchLanguage('stacks-push', 'typescript');
	const view = await learner.problem('stacks-push');
	await learner.submit(view.build, { 'main.ts': 'x' });
}

describe('learner.resetProgress()', () => {
	it('deletes the progress of this Learner only, and the Map shows a new Learner', async () => {
		const { core, db } = await setup();
		await makeProgress({ core, db }, 'a');
		await makeProgress({ core, db }, 'b');
		const other = await core.forLearner('b').map();
		expect((await core.forLearner('a').map()).topics.some((t) => t.coreSolved > 0)).toBe(true);

		await core.forLearner('a').resetProgress();

		const fresh = await core.forLearner('new').map();
		expect(await core.forLearner('a').map()).toEqual(fresh);
		expect((await core.forLearner('a').hints('stacks-push')).revealed).toEqual([]);
		expect((await core.forLearner('a').problem('stacks-push')).build).toMatchObject({
			language: 'python',
			revision: 0
		});
		expect(await core.forLearner('b').map()).toEqual(other);
		expect(await db.submission.count({ where: { learnerId: 'a' } })).toBe(0);
		expect(await db.submission.count({ where: { learnerId: 'b' } })).toBe(1);
		expect(await db.buildStep.count({ where: { learnerId: 'b' } })).toBeGreaterThan(0);
	});

	it('keeps the Learner row', async () => {
		const { core, db } = await setup();
		await db.learner.create({ data: { id: 'a' } });
		await makeProgress({ core, db }, 'a');

		await core.forLearner('a').resetProgress();

		expect(await db.learner.count({ where: { id: 'a' } })).toBe(1);
	});

	it('is harmless for a Learner with no progress', async () => {
		const { core } = await setup();
		await expect(core.forLearner('nobody').resetProgress()).resolves.toBeUndefined();
	});
});

describe('deleteLearner()', () => {
	/** How many rows of a Learner remain, per progress table and the Learner row itself. */
	async function remaining(db: Awaited<ReturnType<typeof setup>>['db'], id: string) {
		const where = { learnerId: id };
		return {
			chapterRead: await db.chapterRead.count({ where }),
			buildStep: await db.buildStep.count({ where }),
			topicLanguage: await db.topicLanguage.count({ where }),
			hintsRevealed: await db.hintsRevealed.count({ where }),
			submission: await db.submission.count({ where }),
			learner: await db.learner.count({ where: { id } })
		};
	}

	it('leaves no row of the Learner in any progress table, nor the Learner row, and leaves another Learner as it was', async () => {
		const { core, db } = await setup();
		await db.learner.create({ data: { id: 'a' } });
		await db.learner.create({ data: { id: 'b' } });
		await makeProgress({ core, db }, 'a');
		await makeProgress({ core, db }, 'b');
		const before = await remaining(db, 'b');
		const other = await core.forLearner('b').map();
		const beforeA = await remaining(db, 'a');
		for (const table of PROGRESS_TABLES) {
			expect(beforeA[table as keyof typeof beforeA], table).toBeGreaterThan(0);
		}

		await deleteLearner(db, 'a');

		expect(await remaining(db, 'a')).toEqual({
			chapterRead: 0,
			buildStep: 0,
			topicLanguage: 0,
			hintsRevealed: 0,
			submission: 0,
			learner: 0
		});
		expect(await remaining(db, 'b')).toEqual(before);
		expect(await core.forLearner('b').map()).toEqual(other);
	});

	it('is harmless for a Learner that never had a row', async () => {
		const { db } = await setup();
		await expect(deleteLearner(db, 'nobody')).resolves.toBeUndefined();
	});

	it('is one transaction: a failure part-way deletes nothing', async () => {
		const { core, db } = await setup();
		await db.learner.create({ data: { id: 'a' } });
		await makeProgress({ core, db }, 'a');
		const before = await remaining(db, 'a');
		// Submission is cleared last: everything before it has been deleted inside the transaction when it fails.
		await db.$executeRawUnsafe(
			"CREATE TRIGGER no_submission_delete BEFORE DELETE ON Submission BEGIN SELECT RAISE(ABORT, 'disk'); END"
		);

		await expect(deleteLearner(db, 'a')).rejects.toThrow();

		expect(await remaining(db, 'a')).toEqual(before);
	});

	it('also fails when the Learner row cannot be deleted, and then deletes nothing', async () => {
		const { core, db } = await setup();
		await db.learner.create({ data: { id: 'a' } });
		await makeProgress({ core, db }, 'a');
		const before = await remaining(db, 'a');
		await db.$executeRawUnsafe(
			"CREATE TRIGGER no_learner_delete BEFORE DELETE ON Learner BEGIN SELECT RAISE(ABORT, 'disk'); END"
		);

		await expect(deleteLearner(db, 'a')).rejects.toThrow();

		expect(await remaining(db, 'a')).toEqual(before);
	});
});

describe('the tables resetProgress clears', () => {
	it('are every model in the Prisma schema with a learnerId field', () => {
		const schema = readFileSync(schemaPath, 'utf8');
		// User links an Account to its Learner; it is not progress, so resetProgress keeps it.
		const notProgress = ['User'];
		const owned = [...schema.matchAll(/^model (\w+) \{([^}]*)\}/gm)]
			.filter(([, name]) => !notProgress.includes(name ?? ''))
			.filter(([, , body]) => /^\s*learnerId\s/m.test(body ?? ''))
			.map(([, name]) => (name ?? '').replace(/^./, (c) => c.toLowerCase()));

		expect(owned.length).toBeGreaterThan(0);
		expect([...PROGRESS_TABLES].sort()).toEqual(owned.sort());
	});
});

describe('the database ties progress to its Learner', () => {
	it('deleting the Learner row alone removes every progress table by cascade, and only that Learner', async () => {
		const { core, db } = await setup();
		await makeProgress({ core, db }, 'a');
		await makeProgress({ core, db }, 'b');
		const countB = async () => [
			await db.chapterRead.count({ where: { learnerId: 'b' } }),
			await db.buildStep.count({ where: { learnerId: 'b' } }),
			await db.topicLanguage.count({ where: { learnerId: 'b' } }),
			await db.hintsRevealed.count({ where: { learnerId: 'b' } }),
			await db.submission.count({ where: { learnerId: 'b' } })
		];
		const before = await countB();
		expect(before.every((n) => n > 0)).toBe(true);

		await db.learner.delete({ where: { id: 'a' } });

		for (const table of PROGRESS_TABLES) {
			const model = db[table as 'submission'] as unknown as {
				count(a: object): Promise<number>;
			};
			expect(await model.count({ where: { learnerId: 'a' } }), table).toBe(0);
		}
		expect(await countB()).toEqual(before);
	});

	it('refuses a Submission for a removed Learner and writes nothing', async () => {
		const { core, db } = await setup();
		await makeProgress({ core, db }, 'a');
		const view = await core.forLearner('a').problem('stacks-push');
		await db.learner.delete({ where: { id: 'a' } });
		const submissions = await db.submission.count();

		await expect(core.forLearner('a').submit(view.build, { 'main.ts': 'x' })).rejects.toThrow();

		expect(await db.submission.count()).toBe(submissions);
		expect(await db.buildStep.count({ where: { learnerId: 'a' } })).toBe(0);
	});

	it('refuses each progress write for a Learner that has no row', async () => {
		const { db } = await setup();
		const learnerId = 'ghost';
		const writes = [
			db.chapterRead.create({ data: { learnerId, chapterId: 'c' } }),
			db.buildStep.create({
				data: { learnerId, topicId: 't', language: 'python', problemId: 'p', files: {} }
			}),
			db.topicLanguage.create({ data: { learnerId, topicId: 't', language: 'python' } }),
			db.hintsRevealed.create({ data: { learnerId, problemId: 'p', count: 1 } }),
			db.submission.create({
				data: {
					learnerId,
					problemId: 'p',
					topicId: 't',
					language: 'python',
					files: {},
					verdict: 'Accepted'
				}
			})
		];
		for (const w of writes) await expect(w).rejects.toMatchObject({ code: expect.any(String) });
	});

	it('does not put the saved code in what a refused write throws', async () => {
		const { db } = await setup();
		const secret = ['SECRET', 'CODE', String(Date.now())].join('-');
		const e = await db.submission
			.create({
				data: {
					learnerId: 'ghost',
					problemId: 'p',
					topicId: 't',
					language: 'python',
					files: { 'main.py': secret },
					verdict: 'Accepted'
				}
			})
			.catch((err: unknown) => err);
		expect(String((e as Error).stack) + String((e as Error).message)).not.toContain(secret);
	});
});
