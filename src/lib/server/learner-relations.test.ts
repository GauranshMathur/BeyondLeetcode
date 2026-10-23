import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { expect, it, onTestFinished } from 'vitest';
import { createFileTestDb } from './test-db.ts';

const dir = fileURLToPath(new URL('../../../prisma/migrations/', import.meta.url));
const MIGRATION = '20261023000000_learner_relations';
const sql = (name: string) => readFileSync(`${dir}${name}/migration.sql`, 'utf8');
const before = readdirSync(dir)
	.filter((n) => /^\d/.test(n) && n < MIGRATION)
	.sort();

const PROGRESS = ['ChapterRead', 'BuildStep', 'TopicLanguage', 'HintsRevealed', 'Submission'];

it('the learner_relations migration deletes exactly the progress whose Learner is gone and keeps the rest', async () => {
	const client = createClient({ url: ':memory:' });
	onTestFinished(() => client.close());
	for (const name of before) await client.executeMultiple(sql(name));
	await client.executeMultiple(`
		INSERT INTO "Learner" ("id") VALUES ('kept');
		INSERT INTO "ChapterRead" ("learnerId","chapterId") VALUES ('kept','c'),('gone','c');
		INSERT INTO "BuildStep" ("learnerId","topicId","language","problemId","files","updatedAt")
			VALUES ('kept','t','python','p','{}',CURRENT_TIMESTAMP),('gone','t','python','p','{}',CURRENT_TIMESTAMP);
		INSERT INTO "TopicLanguage" ("learnerId","topicId","language") VALUES ('kept','t','go'),('gone','t','go');
		INSERT INTO "HintsRevealed" ("learnerId","problemId","count") VALUES ('kept','p',1),('gone','p',1);
		INSERT INTO "Submission" ("id","learnerId","problemId","topicId","language","files","verdict")
			VALUES ('s1','kept','p','t','python','{}','Accepted'),('s2','gone','p','t','python','{}','Accepted');
	`);

	await client.executeMultiple(sql(MIGRATION));

	for (const table of PROGRESS) {
		const rows = await client.execute(`SELECT "learnerId" FROM "${table}"`);
		expect(
			rows.rows.map((r) => r.learnerId),
			table
		).toEqual(['kept']);
	}
	expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([]);
	// The constraint is live on this connection: a write for a removed Learner is refused.
	await expect(
		client.execute(`INSERT INTO "ChapterRead" ("learnerId","chapterId") VALUES ('gone','x')`)
	).rejects.toThrow(/FOREIGN KEY/i);
	await client.execute(`DELETE FROM "Learner" WHERE "id" = 'kept'`);
	for (const table of PROGRESS)
		expect((await client.execute(`SELECT 1 FROM "${table}"`)).rows, table).toEqual([]);
});

it('foreign keys are enforced on the production connection kind (a file database, inside and outside a transaction)', async () => {
	const db = await createFileTestDb();
	const write = (tx: Pick<typeof db, 'chapterRead'>) =>
		tx.chapterRead.create({ data: { learnerId: 'gone', chapterId: 'c' } });

	await expect(write(db)).rejects.toThrow();
	await expect(db.$transaction((tx) => write(tx))).rejects.toThrow();
	expect(await db.chapterRead.count()).toBe(0);
});
