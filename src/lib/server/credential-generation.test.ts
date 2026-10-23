import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { expect, it, onTestFinished } from 'vitest';

const dir = fileURLToPath(new URL('../../../prisma/migrations/', import.meta.url));
const MIGRATION = '20261024000000_credential_generation';
const sql = (name: string) => readFileSync(`${dir}${name}/migration.sql`, 'utf8');
const before = readdirSync(dir)
	.filter((n) => /^\d/.test(n) && n < MIGRATION)
	.sort();

it('the credential_generation migration gives every existing session its user’s current generation, so nobody is signed out', async () => {
	const client = createClient({ url: ':memory:' });
	onTestFinished(() => client.close());
	for (const name of before) await client.executeMultiple(sql(name));
	const at = '2026-10-01 00:00:00';
	await client.executeMultiple(`
		INSERT INTO "Learner" ("id") VALUES ('l1'),('l2'),('l3');
		INSERT INTO "User" ("id","name","email","learnerId") VALUES ('u1','a','a@x','l1'),('u2','b','b@x','l2'),('u3','c','c@x','l3');
		INSERT INTO "Account" ("id","accountId","providerId","userId","password","createdAt","updatedAt") VALUES
			('a1','u1','credential','u1','hash-1','${at}','${at}'),
			('a2','u2','github','u2',NULL,'${at}','${at}'),
			('a3','u3','credential','u3','hash-3','${at}','${at}'),
			('a3g','4242','github','u3',NULL,'${at}','${at}');
		INSERT INTO "Session" ("id","expiresAt","token","userId","updatedAt") VALUES
			('s1','2030-01-01','t1','u1','${at}'),
			('s1b','2030-01-01','t1b','u1','${at}'),
			('s2','2030-01-01','t2','u2','${at}'),
			('s3','2030-01-01','t3','u3','${at}');
	`);

	await client.executeMultiple(sql(MIGRATION));

	const generation = async (table: string, id: string) =>
		String(
			(
				await client.execute(
					`SELECT "credentialGeneration" AS g FROM "${table}" WHERE "id" = '${id}'`
				)
			).rows[0]?.g
		);
	const password1 = await generation('Account', 'a1');
	const password3 = await generation('Account', 'a3');
	expect(password1).toMatch(/^[0-9a-f]{32}$/);
	expect(password3).toMatch(/^[0-9a-f]{32}$/);
	expect(password1).not.toBe(password3);
	// An Account without a password has none.
	expect(await generation('Account', 'a2')).toBe('');
	expect(await generation('Account', 'a3g')).toBe('');
	// Sessions carry their user's password generation, or "" with none.
	expect(await generation('Session', 's1')).toBe(password1);
	expect(await generation('Session', 's1b')).toBe(password1);
	expect(await generation('Session', 's2')).toBe('');
	expect(await generation('Session', 's3')).toBe(password3);
	expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([]);
});

it('the credential_generation migration keeps refused what C53 refused, and every session C53 accepted still resolves', async () => {
	const client = createClient({ url: ':memory:' });
	onTestFinished(() => client.close());
	for (const name of before) await client.executeMultiple(sql(name));
	// Both spellings of a time that SQLite holds here: Prisma's ISO text and the CURRENT_TIMESTAMP default.
	await client.executeMultiple(`
		INSERT INTO "Learner" ("id") VALUES ('l1'),('l2');
		INSERT INTO "User" ("id","name","email","learnerId") VALUES ('u1','a','a@x','l1'),('u2','b','b@x','l2');
		INSERT INTO "Account" ("id","accountId","providerId","userId","password","createdAt","updatedAt") VALUES
			('a1','u1','credential','u1','hash-1','2026-10-01T00:00:00.000Z','2026-10-10T12:00:00.500Z'),
			('a2','u2','credential','u2','hash-2','2026-10-01 00:00:00','2026-10-10 12:00:00');
		INSERT INTO "Session" ("id","expiresAt","token","userId","createdAt","updatedAt") VALUES
			('refused-before','2030-01-01','r1','u1','2026-10-10T12:00:00.499Z','2026-10-10T12:00:00.499Z'),
			('accepted-same-ms','2030-01-01','r2','u1','2026-10-10T12:00:00.500Z','2026-10-10T12:00:00.500Z'),
			('accepted-after','2030-01-01','r3','u1','2026-10-11T00:00:00.000Z','2026-10-11T00:00:00.000Z'),
			('refused-before-2','2030-01-01','r4','u2','2026-10-09 23:59:59','2026-10-09 23:59:59'),
			('accepted-after-2','2030-01-01','r5','u2','2026-10-10 12:00:01','2026-10-10 12:00:01'),
			('accepted-after-iso','2030-01-01','r6','u2','2026-10-10T12:00:01.000Z','2026-10-10T12:00:01.000Z');
	`);

	await client.executeMultiple(sql(MIGRATION));

	const rows = await client.execute(
		`SELECT "s"."id" AS id, "s"."credentialGeneration" AS g, "a"."credentialGeneration" AS current
		 FROM "Session" AS "s" JOIN "Account" AS "a" ON "a"."userId" = "s"."userId" AND "a"."providerId" = 'credential'`
	);
	const resolves = Object.fromEntries(rows.rows.map((r) => [String(r.id), r.g === r.current]));
	expect(resolves).toEqual({
		'refused-before': false,
		'accepted-same-ms': true,
		'accepted-after': true,
		'refused-before-2': false,
		'accepted-after-2': true,
		'accepted-after-iso': true
	});
	const refused = await client.execute(
		`SELECT "credentialGeneration" AS g FROM "Session" WHERE "id" = 'refused-before'`
	);
	expect(refused.rows[0]?.g).toBe('superseded-before-credential-generation');
});

it('the credential_generation migration leaves an OAuth-only user\'s session with ""', async () => {
	const client = createClient({ url: ':memory:' });
	onTestFinished(() => client.close());
	for (const name of before) await client.executeMultiple(sql(name));
	await client.executeMultiple(`
		INSERT INTO "Learner" ("id") VALUES ('l1');
		INSERT INTO "User" ("id","name","email","learnerId") VALUES ('u1','a','a@x','l1');
		INSERT INTO "Account" ("id","accountId","providerId","userId","createdAt","updatedAt") VALUES
			('g1','99','github','u1','2026-10-01 00:00:00','2026-10-01 00:00:00');
		INSERT INTO "Session" ("id","expiresAt","token","userId","updatedAt") VALUES ('s1','2030-01-01','t1','u1','2026-10-01 00:00:00');
	`);

	await client.executeMultiple(sql(MIGRATION));

	const row = await client.execute(
		`SELECT "credentialGeneration" AS g FROM "Session" WHERE "id" = 's1'`
	);
	expect(row.rows[0]?.g).toBe('');
});
