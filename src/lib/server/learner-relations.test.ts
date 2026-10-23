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

const seedUsers = `
	INSERT INTO "User" ("id","name","email","learnerId") VALUES ('u1','a','a@x','l1'),('u2','b','b@x','l2');
`;
const acct = (id: string, user: string, at: string, accountId = 'u1', provider = 'credential') =>
	`('${id}','${accountId}','${provider}','${user}','${at}','${at}')`;
const insertAccounts = (...rows: string[]) =>
	`INSERT INTO "Account" ("id","accountId","providerId","userId","createdAt","updatedAt") VALUES ${rows.join(',')};`;

async function atPreviousMigration() {
	const client = createClient({ url: ':memory:' });
	onTestFinished(() => client.close());
	for (const name of before) await client.executeMultiple(sql(name));
	await client.executeMultiple(seedUsers);
	return client;
}

it('the learner_relations migration keeps the newest of same-owner duplicate Accounts and the unique index then holds', async () => {
	const client = await atPreviousMigration();
	await client.executeMultiple(
		insertAccounts(
			acct('old', 'u1', '2026-01-01 00:00:00'),
			acct('new', 'u1', '2026-03-01 00:00:00'),
			acct('mid', 'u1', '2026-02-01 00:00:00'),
			acct('other', 'u2', '2026-01-01 00:00:00', 'u2'),
			acct('gh', 'u1', '2026-01-01 00:00:00', 'u1', 'github')
		)
	);

	await client.executeMultiple(sql(MIGRATION));

	const rows = await client.execute('SELECT "id" FROM "Account" ORDER BY "id"');
	expect(rows.rows.map((r) => r.id)).toEqual(['gh', 'new', 'other']);
	await expect(
		client.execute(insertAccounts(acct('dup', 'u1', '2026-04-01 00:00:00')))
	).rejects.toThrow(/UNIQUE/i);
});

it('the learner_relations migration stops, changing nothing, when one provider identity belongs to two Users', async () => {
	const client = await atPreviousMigration();
	await client.executeMultiple(
		insertAccounts(
			acct('a', 'u1', '2026-01-01 00:00:00', 'shared', 'google'),
			acct('b', 'u2', '2026-01-02 00:00:00', 'shared', 'google'),
			acct('s1', 'u1', '2026-01-01 00:00:00'),
			acct('s2', 'u1', '2026-01-02 00:00:00')
		)
	);

	await expect(client.executeMultiple(sql(MIGRATION))).rejects.toThrow(
		/stopped_the_same_provider_identity_belongs_to_different_users/
	);

	expect((await client.execute('SELECT 1 FROM "Account"')).rows).toHaveLength(4);
});

it('foreign keys are enforced on the production connection kind (a file database, inside and outside a transaction)', async () => {
	const db = await createFileTestDb();
	const write = (tx: Pick<typeof db, 'chapterRead'>) =>
		tx.chapterRead.create({ data: { learnerId: 'gone', chapterId: 'c' } });

	await expect(write(db)).rejects.toThrow();
	await expect(db.$transaction((tx) => write(tx))).rejects.toThrow();
	expect(await db.chapterRead.count()).toBe(0);
});
