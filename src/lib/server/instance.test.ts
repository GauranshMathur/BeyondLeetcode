import { createClient } from '@libsql/client';
import { expect, it } from 'vitest';
import { createInstance } from './instance.ts';
import { createTestDb } from './test-db.ts';

const migrations = import.meta.glob<string>('/prisma/migrations/*/migration.sql', {
	query: '?raw',
	import: 'default',
	eager: true
});
const paths = Object.keys(migrations).sort();

it('reports not set up on a fresh database', async () => {
	const instance = await createInstance(await createTestDb());

	expect(instance.mode()).toBeNull();
	expect(instance.registrationMode()).toBe('invite');
});

it('chooseLocal sets the mode, persists it, and a second call fails without overwriting', async () => {
	const db = await createTestDb();
	const instance = await createInstance(db);

	await instance.chooseLocal();

	expect(instance.mode()).toBe('local');
	expect((await createInstance(db)).mode()).toBe('local');
	await expect(instance.chooseLocal()).rejects.toThrow(/already set up/);
	expect(await db.instance.count()).toBe(1);
});

it('a second module on the same database cannot claim a set-up Instance', async () => {
	const db = await createTestDb();
	const first = await createInstance(db);
	const stale = await createInstance(db);

	await first.chooseLocal();

	await expect(stale.chooseLocal()).rejects.toThrow(/already set up/);
	expect(stale.mode()).toBeNull();
});

it('reads a stored multi mode and open registration', async () => {
	const db = await createTestDb();
	await db.instance.create({ data: { mode: 'multi', registrationMode: 'open' } });

	const instance = await createInstance(db);

	expect(instance.mode()).toBe('multi');
	expect(instance.registrationMode()).toBe('open');
});

it('migrating a database that holds the local Learner makes it Local', async () => {
	const client = createClient({ url: ':memory:' });
	const last = paths.findIndex((p) => p.includes('_instance'));
	expect(last).toBeGreaterThan(-1);
	await client.executeMultiple(
		paths
			.slice(0, last)
			.map((p) => migrations[p])
			.join('\n')
	);
	await client.execute(`INSERT INTO "Learner" ("id") VALUES ('local')`);

	await client.executeMultiple(migrations[paths[last]]);

	const { rows } = await client.execute(`SELECT "mode", "registrationMode" FROM "Instance"`);
	expect(rows.map((r) => ({ ...r }))).toEqual([{ mode: 'local', registrationMode: 'invite' }]);
	client.close();
});

it('migrating a database without the local Learner leaves it not set up', async () => {
	const client = createClient({ url: ':memory:' });
	await client.executeMultiple(paths.map((p) => migrations[p]).join('\n'));

	const { rows } = await client.execute(`SELECT * FROM "Instance"`);
	expect(rows).toHaveLength(0);
	client.close();
});
