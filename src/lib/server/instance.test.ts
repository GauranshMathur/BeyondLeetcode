import { createClient } from '@libsql/client';
import { expect, it } from 'vitest';
import type { Db } from './db.ts';
import {
	AccountsExistError,
	clearEmptyMultiInstance,
	createInstance,
	InstanceAlreadySetUpError,
	InvalidRegistrationModeError,
	RegistrationNotAvailableError,
	restoreMultiInstance
} from './instance.ts';
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
	// The refusal re-reads the row, so the loser's cached mode is no longer stale.
	expect(stale.mode()).toBe('local');
});

it('a stale module that loses a create to another mode adopts the stored mode, and its other call too', async () => {
	const db = await createTestDb();
	const first = await createInstance(db);
	const stale = await createInstance(db);
	await first.chooseMulti();

	await expect(stale.chooseMulti()).rejects.toThrow(InstanceAlreadySetUpError);

	expect(stale.mode()).toBe('multi');
	await expect(stale.chooseLocal()).rejects.toThrow(InstanceAlreadySetUpError);
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
	expect(stale.mode()).toBe('multi');
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

// setRegistrationMode: the admin's toggle (C34b). The database is written first, memory after.

/** A database whose Instance writes (and, when named, reads) can be held, failed or delayed, to pin the order of the two. */
function interceptWrites(
	db: Db,
	intercept: (args: unknown, write: () => Promise<unknown>) => Promise<unknown>,
	methods: string[] = ['updateMany']
): Db {
	return new Proxy(db, {
		get(target, prop) {
			const value = Reflect.get(target, prop);
			if (prop !== 'instance') return value;
			return new Proxy(value, {
				get(delegate, method) {
					const member = Reflect.get(delegate, method);
					if (typeof method !== 'string' || !methods.includes(method)) return member;
					return (args: unknown) => intercept(args, () => member.call(delegate, args));
				}
			});
		}
	});
}

const stored = async (db: Db) =>
	(await db.instance.findUniqueOrThrow({ where: { id: 'instance' } })).registrationMode;

async function multiInstance() {
	const db = await createTestDb();
	const instance = await createInstance(db);
	await instance.chooseMulti();
	return { db, instance };
}

it('setRegistrationMode switches a Multi-user Instance both ways, in memory and in the database', async () => {
	const { db, instance } = await multiInstance();

	await instance.setRegistrationMode('open');

	expect(instance.registrationMode()).toBe('open');
	expect(await stored(db)).toBe('open');
	expect((await createInstance(db)).registrationMode()).toBe('open');

	await instance.setRegistrationMode('invite');

	expect(instance.registrationMode()).toBe('invite');
	expect(await stored(db)).toBe('invite');
	expect((await createInstance(db)).registrationMode()).toBe('invite');
});

it('setRegistrationMode keeps the mode it was given when set again', async () => {
	const { instance } = await multiInstance();
	await instance.setRegistrationMode('open');

	await instance.setRegistrationMode('open');

	expect(instance.registrationMode()).toBe('open');
});

it('setRegistrationMode writes the database before it changes memory', async () => {
	const { db } = await multiInstance();
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const instance = await createInstance(
		interceptWrites(db, async (_, write) => {
			await held;
			return write();
		})
	);

	const switching = instance.setRegistrationMode('open');
	await new Promise((resolve) => setTimeout(resolve, 20));

	// The write has not finished: memory and database both still say invite-only.
	expect(instance.registrationMode()).toBe('invite');
	expect(await stored(db)).toBe('invite');

	release();
	await switching;

	expect(instance.registrationMode()).toBe('open');
	expect(await stored(db)).toBe('open');
});

it('a failed write leaves memory as it was, so a failure never leaves it Open over an Invite-only database', async () => {
	const { db } = await multiInstance();
	const instance = await createInstance(
		interceptWrites(db, async () => {
			throw new Error('disk full');
		})
	);

	await expect(instance.setRegistrationMode('open')).rejects.toThrow('disk full');

	expect(instance.registrationMode()).toBe('invite');
	expect(await stored(db)).toBe('invite');
});

it('a failed write back to Invite-only does not claim it succeeded', async () => {
	const { db } = await multiInstance();
	let failing = false;
	const instance = await createInstance(
		interceptWrites(db, async (_, write) => {
			if (failing) throw new Error('disk full');
			return write();
		})
	);
	await instance.setRegistrationMode('open');
	failing = true;

	await expect(instance.setRegistrationMode('invite')).rejects.toThrow('disk full');

	// Memory still matches the database (Open); the caller was told the switch did not happen.
	expect(instance.registrationMode()).toBe('open');
	expect(await stored(db)).toBe('open');
});

it.each(['everyone', 'OPEN', 'Invite', '', 'open ', 'invite-only', undefined, null, 1, {}])(
	'setRegistrationMode refuses %j and changes nothing',
	async (value) => {
		const { db, instance } = await multiInstance();
		await instance.setRegistrationMode('open');

		await expect(instance.setRegistrationMode(value as never)).rejects.toThrow(
			InvalidRegistrationModeError
		);

		expect(instance.registrationMode()).toBe('open');
		expect(await stored(db)).toBe('open');
	}
);

it('setRegistrationMode refuses in Local mode and writes nothing', async () => {
	const db = await createTestDb();
	const instance = await createInstance(db);
	await instance.chooseLocal();

	await expect(instance.setRegistrationMode('open')).rejects.toThrow(RegistrationNotAvailableError);

	expect(instance.registrationMode()).toBe('invite');
	expect(await stored(db)).toBe('invite');
});

it('setRegistrationMode refuses before the Instance is set up and creates no row', async () => {
	const db = await createTestDb();
	const instance = await createInstance(db);

	await expect(instance.setRegistrationMode('open')).rejects.toThrow(RegistrationNotAvailableError);

	expect(instance.registrationMode()).toBe('invite');
	expect(await db.instance.count()).toBe(0);
});

it('setRegistrationMode on a module that thinks the Instance is multi, over a database that is not, writes nothing', async () => {
	const { db, instance } = await multiInstance();
	// Someone else undid the switch behind this module's back.
	await db.instance.update({ where: { id: 'instance' }, data: { mode: 'local' } });

	await expect(instance.setRegistrationMode('open')).rejects.toThrow(RegistrationNotAvailableError);

	expect(instance.mode()).toBe('local');
	expect(instance.registrationMode()).toBe('invite');
	expect(await stored(db)).toBe('invite');
});

it('two switches at once end with memory and database agreeing, the later call winning', async () => {
	const { db } = await multiInstance();
	// The first write reaches the database but its answer is slow, so the second could overtake it.
	let first = true;
	const instance = await createInstance(
		interceptWrites(db, async (_, write) => {
			const result = await write();
			if (first) {
				first = false;
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return result;
		})
	);

	await Promise.all([instance.setRegistrationMode('open'), instance.setRegistrationMode('invite')]);

	expect(await stored(db)).toBe('invite');
	expect(instance.registrationMode()).toBe('invite');
});

it('a switch that fails does not stop the next one', async () => {
	const { db } = await multiInstance();
	let failNext = true;
	const instance = await createInstance(
		interceptWrites(db, async (_, write) => {
			if (failNext) {
				failNext = false;
				throw new Error('disk full');
			}
			return write();
		})
	);

	const results = await Promise.allSettled([
		instance.setRegistrationMode('open'),
		instance.setRegistrationMode('open')
	]);

	expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
	expect(instance.registrationMode()).toBe('open');
	expect(await stored(db)).toBe('open');
});

it('a write that commits and then rejects leaves memory on what the database holds, and still rejects', async () => {
	const { db } = await multiInstance();
	let faulty = false;
	const instance = await createInstance(
		interceptWrites(db, async (_, write) => {
			const result = await write();
			// The row is changed, then the driver reports a fault: the caller cannot tell it was written.
			if (faulty) throw new Error('driver fault after commit');
			return result;
		})
	);
	await instance.setRegistrationMode('open');
	faulty = true;

	await expect(instance.setRegistrationMode('invite')).rejects.toThrow('driver fault after commit');

	// Memory follows the database (Invite-only), not the Open it held before: it never fails open.
	expect(await stored(db)).toBe('invite');
	expect(instance.registrationMode()).toBe('invite');
});

it('a write that commits Open and then rejects leaves memory Open, as the database is', async () => {
	const { db } = await multiInstance();
	const instance = await createInstance(
		interceptWrites(db, async (_, write) => {
			await write();
			throw new Error('driver fault after commit');
		})
	);

	await expect(instance.setRegistrationMode('open')).rejects.toThrow('driver fault after commit');

	expect(await stored(db)).toBe('open');
	expect(instance.registrationMode()).toBe('open');
});

it('a failed write whose re-read fails too leaves memory Invite-only, never Open', async () => {
	const { db } = await multiInstance();
	let faulty = false;
	const instance = await createInstance(
		interceptWrites(
			db,
			async (_, write) => {
				if (faulty) throw new Error('disk gone');
				return write();
			},
			['updateMany', 'findUnique']
		)
	);
	await instance.setRegistrationMode('open');
	faulty = true;

	await expect(instance.setRegistrationMode('invite')).rejects.toThrow('disk gone');

	// Nothing could be read to say what the database holds (it still says Open here): closed is the safe guess.
	expect(instance.registrationMode()).toBe('invite');
	expect(await stored(db)).toBe('open');
});

it('after a failed switch the next one still works', async () => {
	const { db } = await multiInstance();
	let faulty = false;
	const instance = await createInstance(
		interceptWrites(
			db,
			async (_, write) => {
				if (faulty) throw new Error('disk gone');
				return write();
			},
			['updateMany', 'findUnique']
		)
	);
	faulty = true;
	await instance.setRegistrationMode('invite').catch(() => {});
	faulty = false;

	await instance.setRegistrationMode('open');

	expect(instance.registrationMode()).toBe('open');
	expect(await stored(db)).toBe('open');
});

it.each(['everyone', 'OPEN', '', ' open'])(
	'a stored Registration Mode of %j is read as invite-only at start',
	async (value) => {
		const db = await createTestDb();
		await db.instance.create({ data: { mode: 'multi', registrationMode: value } });

		const instance = await createInstance(db);

		expect(instance.registrationMode()).toBe('invite');
		// And the unreadable value does not stop an admin from choosing one.
		await instance.setRegistrationMode('open');
		expect(instance.registrationMode()).toBe('open');
		expect(await stored(db)).toBe('open');
	}
);

// clearEmptyMultiInstance: the `reset-admin-password` command's way to reopen Setup (C42b).

const addUser = (db: Db) =>
	db.user.create({
		data: { id: 'u1', name: 'A', email: 'a@example.com', emailVerified: false, learnerId: 'l1' }
	});

it('clearEmptyMultiInstance clears a multi Instance with no Accounts, so the next start is not set up', async () => {
	const { db } = await multiInstance();

	expect(await clearEmptyMultiInstance(db)).toBe(true);

	expect(await db.instance.count()).toBe(0);
	expect((await createInstance(db)).mode()).toBeNull();
});

it('clearEmptyMultiInstance refuses, changing nothing, when any Account exists', async () => {
	const { db } = await multiInstance();
	await addUser(db);

	expect(await clearEmptyMultiInstance(db)).toBe(false);

	expect((await createInstance(db)).mode()).toBe('multi');
});

it('clearEmptyMultiInstance refuses a Local Instance and one that is not set up', async () => {
	const db = await createTestDb();
	expect(await clearEmptyMultiInstance(db)).toBe(false);
	await (await createInstance(db)).chooseLocal();

	expect(await clearEmptyMultiInstance(db)).toBe(false);

	expect((await createInstance(db)).mode()).toBe('local');
});

it('clearEmptyMultiInstance checks the Accounts and clears in one statement, so a sign-up cannot slip between', async () => {
	const { db } = await multiInstance();
	const statements: string[] = [];
	const spied = new Proxy(db, {
		get(target, prop) {
			if (prop === '$executeRaw') {
				return (strings: TemplateStringsArray) => {
					statements.push(strings.join('?'));
					return (target.$executeRaw as (s: TemplateStringsArray) => Promise<number>)(strings);
				};
			}
			if (prop === 'user' || prop === 'instance' || prop === '$transaction') {
				throw new Error('must not read or write separately');
			}
			return Reflect.get(target, prop);
		}
	});

	expect(await clearEmptyMultiInstance(spied)).toBe(true);

	expect(statements).toHaveLength(1);
	expect(statements[0]).toMatch(/DELETE FROM "Instance"[\s\S]*NOT EXISTS[\s\S]*"User"/);
});

// C54: Local is refused once any Account exists, and the reset command can restore a lost multi mode.

it('chooseLocal refuses when any Account exists, writes nothing and leaves the mode unset', async () => {
	const db = await createTestDb();
	await addUser(db);
	const instance = await createInstance(db);

	await expect(instance.chooseLocal()).rejects.toBeInstanceOf(AccountsExistError);

	expect(instance.mode()).toBeNull();
	expect(await db.instance.count()).toBe(0);
});

it('chooseLocal claims in one statement that holds the Accounts check, so a sign-up cannot slip between', async () => {
	const db = await createTestDb();
	const statements: string[] = [];
	const spied = new Proxy(db, {
		get(target, prop) {
			if (prop === '$executeRaw') {
				return (strings: TemplateStringsArray) => {
					statements.push(strings.join('?'));
					return (target.$executeRaw as (s: TemplateStringsArray) => Promise<number>)(strings);
				};
			}
			if (prop === 'user' || prop === '$transaction') throw new Error('must not read separately');
			return Reflect.get(target, prop);
		}
	});
	const instance = await createInstance(spied);

	await instance.chooseLocal();

	expect(instance.mode()).toBe('local');
	expect(statements).toHaveLength(1);
	expect(statements[0]).toMatch(/INSERT INTO "Instance"[\s\S]*NOT EXISTS[\s\S]*"User"/);
});

const addAdmin = (db: Db, role = 'admin') =>
	db.user.create({
		data: {
			id: 'u1',
			name: 'A',
			email: 'a@example.com',
			emailVerified: false,
			learnerId: 'l1',
			role
		}
	});

it('restoreMultiInstance stores multi when an admin Account exists and no mode is stored', async () => {
	const db = await createTestDb();
	await addAdmin(db);

	expect(await restoreMultiInstance(db)).toBe(true);

	const restarted = await createInstance(db);
	expect(restarted.mode()).toBe('multi');
	expect(restarted.registrationMode()).toBe('invite');
});

it('restoreMultiInstance refuses without an admin (none, a learner, admin,learner) and when a mode is stored', async () => {
	const none = await createTestDb();
	expect(await restoreMultiInstance(none)).toBe(false);
	for (const role of ['learner', 'admin,learner', 'Admin']) {
		const db = await createTestDb();
		await addAdmin(db, role);
		expect(await restoreMultiInstance(db)).toBe(false);
		expect(await db.instance.count()).toBe(0);
	}
	const local = await createTestDb();
	await addAdmin(local);
	await local.instance.create({ data: { mode: 'local' } }).catch(() => {});
	expect(await restoreMultiInstance(local)).toBe(false);
	expect((await createInstance(local)).mode()).toBe('local');
});

// C39: converting Local to multi is one narrow statement.

it('chooseMulti refuses to convert a Local Instance once an Account exists, and the row stays local', async () => {
	const db = await createTestDb();
	const instance = await createInstance(db);
	await instance.chooseLocal();
	await addUser(db);

	await expect(instance.chooseMulti()).rejects.toThrow(InstanceAlreadySetUpError);

	expect((await db.instance.findFirstOrThrow()).mode).toBe('local');
	expect(instance.mode()).toBe('local');
});

it('two conversions racing each other: exactly one wins, whichever Instance object they use', async () => {
	for (const two of [false, true]) {
		const db = await createTestDb();
		const a = await createInstance(db);
		await a.chooseLocal();
		const b = two ? await createInstance(db) : a;

		const results = await Promise.allSettled([a.chooseMulti(), b.chooseMulti()]);

		expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
		expect((await db.instance.findFirstOrThrow()).mode).toBe('multi');
	}
});

it('a conversion switches this process at once, and its undo puts Local back, never unset', async () => {
	const db = await createTestDb();
	const instance = await createInstance(db);
	await instance.chooseLocal();

	const claim = await instance.chooseMulti();
	expect(instance.mode()).toBe('multi');
	await claim.undo();

	expect(instance.mode()).toBe('local');
	expect((await db.instance.findFirstOrThrow()).mode).toBe('local');
});

it('a stale Local cache cannot convert an Instance another process already made multi, and adopts it', async () => {
	const db = await createTestDb();
	const stale = await createInstance(db);
	await stale.chooseLocal();
	await db.instance.updateMany({ data: { mode: 'multi' } }); // another process converted

	await expect(stale.chooseMulti()).rejects.toThrow(InstanceAlreadySetUpError);

	expect(stale.mode()).toBe('multi');
});
