import { createClient } from '@libsql/client';
import { expect, it } from 'vitest';
import { createInstance, InstanceAlreadySetUpError } from './instance.ts';
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

it('chooseMulti on a fresh database creates the row as multi and persists it', async () => {
	const db = await createTestDb();
	const instance = await createInstance(db);

	await instance.chooseMulti();

	expect(instance.mode()).toBe('multi');
	expect((await createInstance(db)).mode()).toBe('multi');
	expect(await db.instance.count()).toBe(1);
});

it('chooseMulti converts a Local Instance to multi, keeping its row', async () => {
	const db = await createTestDb();
	const instance = await createInstance(db);
	await instance.chooseLocal();

	await instance.chooseMulti();

	expect(instance.mode()).toBe('multi');
	expect(await db.instance.findMany()).toEqual([expect.objectContaining({ mode: 'multi' })]);
});

it('chooseMulti on a multi Instance throws the already-set-up error and changes nothing', async () => {
	const db = await createTestDb();
	const instance = await createInstance(db);
	await instance.chooseMulti();

	await expect(instance.chooseMulti()).rejects.toThrow(InstanceAlreadySetUpError);
	await expect(instance.chooseMulti()).rejects.toThrow(/already set up/);
	await expect(instance.chooseLocal()).rejects.toThrow(/already set up/);
	expect(instance.mode()).toBe('multi');
});

it('a stale module cannot convert an Instance another module already made multi', async () => {
	const db = await createTestDb();
	const first = await createInstance(db);
	await first.chooseLocal();
	const stale = await createInstance(db);
	await first.chooseMulti();

	await expect(stale.chooseMulti()).rejects.toThrow(InstanceAlreadySetUpError);
	expect(stale.mode()).toBe('local');
});

it('chooseMulti undo puts a fresh Instance back to not set up, and a Local one back to local', async () => {
	const fresh = await createTestDb();
	const a = await createInstance(fresh);
	await (await a.chooseMulti()).undo();
	expect(a.mode()).toBeNull();
	expect(await fresh.instance.count()).toBe(0);

	const local = await createTestDb();
	const b = await createInstance(local);
	await b.chooseLocal();
	await (await b.chooseMulti()).undo();
	expect(b.mode()).toBe('local');
	expect(await local.instance.findMany()).toEqual([expect.objectContaining({ mode: 'local' })]);
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

it.each([
	['one Instance object', false],
	['two Instance objects', true]
])('two chooseMulti calls on a Local Instance via %s: exactly one wins', async (_, two) => {
	const db = await createTestDb();
	const a = await createInstance(db);
	await a.chooseLocal();
	const b = two ? await createInstance(db) : a;

	const results = await Promise.allSettled([a.chooseMulti(), b.chooseMulti()]);

	expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
	expect((await db.instance.findFirstOrThrow()).mode).toBe('multi');
});
