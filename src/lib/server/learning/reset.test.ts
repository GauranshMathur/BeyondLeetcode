import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
import { createScriptedRunner, type RunnerScript } from '../runner/fake.ts';
import { createTestDb } from '../test-db.ts';
import { createLearningCore } from './core.ts';
import { PROGRESS_TABLES } from './progress.ts';

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
async function makeProgress(core: Awaited<ReturnType<typeof setup>>['core'], id: string) {
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
		await makeProgress(core, 'a');
		await makeProgress(core, 'b');
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
		await makeProgress(core, 'a');

		await core.forLearner('a').resetProgress();

		expect(await db.learner.count({ where: { id: 'a' } })).toBe(1);
	});

	it('is harmless for a Learner with no progress', async () => {
		const { core } = await setup();
		await expect(core.forLearner('nobody').resetProgress()).resolves.toBeUndefined();
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
