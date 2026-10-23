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
