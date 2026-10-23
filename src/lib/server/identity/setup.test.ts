import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
import { createInstance, InstanceAlreadySetUpError, restoreMultiInstance } from '../instance.ts';
import { createLearningCore } from '../learning/core.ts';
import { createFileTestDb } from '../test-db.ts';
import { type Auth, createAuth } from './auth.ts';
import { createMultiUserIdentity } from './multi-user.ts';
import { createRegistration } from './registration.ts';
import { createFirstAdmin, isFirstAdmin } from './setup.ts';

const fixtureDir = fileURLToPath(new URL('../content/fixture', import.meta.url));
const secret = 'test-secret-test-secret-test-secret-0123';
const admin = { name: 'Root', email: 'root@example.com', password: 'correct horse battery' };

async function setup() {
	const db = await createFileTestDb();
	const instance = await createInstance(db);
	const auth = createAuth({
		db,
		origin: 'http://localhost:3000',
		secret,
		admitSignUp: createRegistration({ instance })
	});
	const core = createLearningCore({ catalogue: await loadCatalogue(fixtureDir), db });
	return { db, auth, instance, core };
}

const cookieOf = (headers: Headers) =>
	headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');

/** An Auth whose sign-up writes the user row, then fails: the half-made Account case. */
function failingAfterUser(auth: Auth): Auth {
	return {
		...auth,
		api: {
			...auth.api,
			signUpEmail: async (...args: Parameters<typeof auth.api.signUpEmail>) => {
				await auth.api.signUpEmail(...args);
				throw new Error('session store down');
			}
		}
	} as unknown as Auth;
}

describe('createFirstAdmin', () => {
	it('on a fresh Instance makes a multi Instance whose admin owns an empty local Learner', async () => {
		const { db, auth, instance, core } = await setup();

		const { headers } = await createFirstAdmin({ instance, auth, db }, admin);

		expect(instance.mode()).toBe('multi');
		expect(await db.user.findFirstOrThrow()).toMatchObject({
			learnerId: 'local',
			role: 'admin',
			email: admin.email
		});
		expect((await core.forLearner('local').map()).topics[0]).toMatchObject({ coreSolved: 0 });
		const who = await createMultiUserIdentity(auth).resolve({
			cookies: { get: () => undefined },
			request: { headers: new Headers({ cookie: cookieOf(headers) }) }
		});
		expect(who).toEqual({
			learnerId: 'local',
			displayName: 'Root',
			role: 'admin',
			mustChangePassword: false,
			refreshedCookies: []
		});
	});

	it('when the Local Learner already has progress, the admin takes it over and sees it on the Map', async () => {
		const { db, auth, instance, core } = await setup();
		await db.learner.create({ data: { id: 'local' } });
		await core.forLearner('local').reachChapterEnd('stacks-undo-log');
		const before = await core.forLearner('local').map();
		expect(before.topics[0]).toMatchObject({ id: 'stacks' });

		const { headers } = await createFirstAdmin({ instance, auth, db }, admin);

		const user = await createMultiUserIdentity(auth).resolve({
			cookies: { get: () => undefined },
			request: { headers: new Headers({ cookie: cookieOf(headers) }) }
		});
		expect(user?.learnerId).toBe('local');
		expect(await core.forLearner(user?.learnerId ?? '').map()).toEqual(before);
		expect((await core.forLearner('local').chapter('stacks-undo-log')).read).toBe(true);
		expect(await db.learner.count()).toBe(1);
	});

	it('refuses a second call and leaves the first admin alone', async () => {
		const { db, auth, instance } = await setup();
		await createFirstAdmin({ instance, auth, db }, admin);

		await expect(
			createFirstAdmin({ instance, auth, db }, { ...admin, email: 'two@example.com' })
		).rejects.toThrow(/already set up/);
		expect(await db.user.count()).toBe(1);
		expect(instance.mode()).toBe('multi');
	});

	it('gives exactly one admin when two calls race', async () => {
		const { db, auth, instance } = await setup();
		const other = await createInstance(db);

		const results = await Promise.allSettled([
			createFirstAdmin({ instance, auth, db }, admin),
			createFirstAdmin({ instance: other, auth, db }, { ...admin, email: 'two@example.com' })
		]);

		expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
		expect(await db.user.count()).toBe(1);
	});

	it('refuses a short password before claiming the Instance', async () => {
		const { db, auth, instance } = await setup();

		await expect(
			createFirstAdmin({ instance, auth, db }, { ...admin, password: 'short' })
		).rejects.toThrow(/password/i);

		expect(instance.mode()).toBeNull();
		expect(await db.instance.count()).toBe(0);
	});

	it('puts a fresh Instance back to not set up when sign-up fails after the claim', async () => {
		const { db, auth, instance } = await setup();

		await expect(
			createFirstAdmin({ instance, auth: failingAfterUser(auth), db }, admin)
		).rejects.toThrow();

		expect(instance.mode()).toBeNull();
		expect(await db.instance.count()).toBe(0);
		expect(await db.user.count()).toBe(0);
		await expect(createFirstAdmin({ instance, auth, db }, admin)).resolves.toBeTruthy();
	});

	it.each([
		['one Instance object', false],
		['a stale one', true]
	])(
		'refuses a Local Instance unless the caller asks to convert it, whatever it thinks (%s)',
		async (_, stale) => {
			const { db, auth, instance } = await setup();
			const caller = stale ? await createInstance(db) : instance;
			await instance.chooseLocal();

			await expect(createFirstAdmin({ instance: caller, auth, db }, admin)).rejects.toThrow(
				InstanceAlreadySetUpError
			);

			expect(await db.user.count()).toBe(0);
			expect((await db.instance.findFirstOrThrow()).mode).toBe('local');
			expect(caller.mode()).toBe('local');
		}
	);

	it('converts a Local Instance on request: the admin takes the Local Learner and its read Chapter', async () => {
		const { db, auth, instance, core } = await setup();
		await instance.chooseLocal();
		await db.learner.create({ data: { id: 'local' } }).catch(() => {});
		await core.forLearner('local').reachChapterEnd('stacks-undo-log');

		const { headers } = await createFirstAdmin({ instance, auth, db }, { ...admin, convert: true });

		expect(instance.mode()).toBe('multi');
		expect((await db.instance.findFirstOrThrow()).mode).toBe('multi');
		expect(await db.user.findFirstOrThrow()).toMatchObject({ learnerId: 'local', role: 'admin' });
		expect((await core.forLearner('local').chapter('stacks-undo-log')).read).toBe(true);
		expect(headers.getSetCookie().length).toBeGreaterThan(0);
	});

	it('puts a converted Instance back to local, not unset, when sign-up fails', async () => {
		const { db, auth, instance } = await setup();
		await instance.chooseLocal();

		await expect(
			createFirstAdmin({ instance, auth: failingAfterUser(auth), db }, { ...admin, convert: true })
		).rejects.toThrow('session store down');

		expect(instance.mode()).toBe('local');
		expect((await db.instance.findFirstOrThrow()).mode).toBe('local');
		expect(await db.user.count()).toBe(0);
	});

	it('does not convert a multi Instance, or a Local one that has an Account', async () => {
		const first = await setup();
		await createFirstAdmin({ instance: first.instance, auth: first.auth, db: first.db }, admin);
		await expect(
			createFirstAdmin(
				{ instance: first.instance, auth: first.auth, db: first.db },
				{ ...admin, email: 'two@example.com', convert: true }
			)
		).rejects.toThrow(InstanceAlreadySetUpError);

		const { db, auth, instance } = await setup();
		await instance.chooseLocal();
		await db.user.create({
			data: { id: 'u1', name: 'A', email: 'a@example.com', emailVerified: false, learnerId: 'x' }
		});
		await expect(
			createFirstAdmin({ instance, auth, db }, { ...admin, convert: true })
		).rejects.toThrow(InstanceAlreadySetUpError);
		expect((await db.instance.findFirstOrThrow()).mode).toBe('local');
	});

	it('an Account made between the check and the conversion refuses it, and Local stays local', async () => {
		const { db, auth, instance } = await setup();
		await instance.chooseLocal();
		let reached!: () => void;
		let release!: () => void;
		const atCheck = new Promise<void>((resolve) => {
			reached = resolve;
		});
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let paused = false;
		const slowCount = new Proxy(db, {
			get(target, prop) {
				if (prop !== 'user') return Reflect.get(target, prop);
				return new Proxy(target.user, {
					get(user, method) {
						const member = Reflect.get(user, method);
						if (method !== 'count') return member;
						return async (...args: unknown[]) => {
							const result = await (member as (...a: unknown[]) => Promise<number>).apply(
								user,
								args
							);
							if (!paused) {
								paused = true;
								reached();
								await gate;
							}
							return result;
						};
					}
				});
			}
		}) as typeof db;

		const attempt = createFirstAdmin(
			{ instance, auth, db: slowCount },
			{ ...admin, convert: true }
		);
		const outcome = attempt.then(
			() => 'created',
			(error) => error
		);
		await atCheck; // the first check saw no Account; one now appears
		await db.user.create({
			data: { id: 'u1', name: 'B', email: 'b@example.com', emailVerified: false, learnerId: 'x' }
		});
		release();

		expect(await outcome).toBeInstanceOf(InstanceAlreadySetUpError);
		expect((await db.instance.findFirstOrThrow()).mode).toBe('local');
		expect(instance.mode()).toBe('local');
		expect(await db.user.count()).toBe(1);
	});

	it('refuses before claiming when an Account exists, so a restore that lands in between is not undone', async () => {
		const { db, auth, instance } = await setup();
		await db.user.create({
			data: {
				id: 'u1',
				name: 'A',
				email: 'a@example.com',
				emailVerified: false,
				role: 'admin',
				learnerId: 'local'
			}
		});
		// Pause createFirstAdmin at its first Accounts check; the reset command's restore lands there.
		let reached!: () => void;
		let release!: () => void;
		const atCheck = new Promise<void>((resolve) => {
			reached = resolve;
		});
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let paused = false;
		const slowCount = new Proxy(db, {
			get(target, prop) {
				if (prop !== 'user') return Reflect.get(target, prop);
				return new Proxy(target.user, {
					get(user, method) {
						const member = Reflect.get(user, method);
						if (method !== 'count') return member;
						return async (...args: unknown[]) => {
							if (!paused) {
								paused = true;
								reached();
								await gate;
							}
							return (member as (...a: unknown[]) => Promise<number>).apply(user, args);
						};
					}
				});
			}
		}) as typeof db;

		const attempt = createFirstAdmin({ instance, auth, db: slowCount }, admin);
		const outcome = attempt.then(
			() => 'created',
			(error) => error
		);
		await atCheck;
		expect(await restoreMultiInstance(db)).toBe(true); // no row was claimed, so the restore can land
		release();

		expect(await outcome).toBeInstanceOf(InstanceAlreadySetUpError);
		expect((await db.instance.findUniqueOrThrow({ where: { id: 'instance' } })).mode).toBe('multi');
		expect(await db.user.count()).toBe(1);
	});

	it('refuses a multi Instance even when it has no Accounts: recovery is not a re-run of Setup', async () => {
		const { db, auth } = await setup();
		await db.instance.create({ data: { mode: 'multi' } });
		const instance = await createInstance(db);

		await expect(createFirstAdmin({ instance, auth, db }, admin)).rejects.toThrow(
			InstanceAlreadySetUpError
		);

		expect(await db.user.count()).toBe(0);
	});

	it('removes the half-made Account but keeps Local progress when sign-up fails after the user row', async () => {
		const { db, auth, instance, core } = await setup();
		await db.learner.create({ data: { id: 'local' } });
		await core.forLearner('local').reachChapterEnd('stacks-undo-log');
		const failing = failingAfterUser(auth);

		await expect(createFirstAdmin({ instance, auth: failing, db }, admin)).rejects.toThrow(
			/session store down/
		);

		expect(await db.user.count()).toBe(0);
		expect(instance.mode()).toBeNull();
		expect((await core.forLearner('local').chapter('stacks-undo-log')).read).toBe(true);
		await expect(createFirstAdmin({ instance, auth, db }, admin)).resolves.toBeTruthy();
	});

	it('refuses a bad email before touching the Instance', async () => {
		const { db, auth, instance } = await setup();

		await expect(
			createFirstAdmin({ instance, auth, db }, { ...admin, email: 'nope' })
		).rejects.toThrow(/email/i);

		expect(instance.mode()).toBeNull();
		expect(await db.instance.count()).toBe(0);
	});

	it('stays closed (multi in row and memory) when the rollback itself fails', async () => {
		const { db, auth, instance } = await setup();
		const broken = {
			...db,
			user: { ...db.user, deleteMany: async () => Promise.reject(new Error('disk gone')) }
		} as unknown as typeof db;

		await expect(
			createFirstAdmin({ instance, auth: failingAfterUser(auth), db: broken }, admin)
		).rejects.toThrow(/session store down/);

		expect(instance.mode()).toBe('multi');
		expect((await db.instance.findFirstOrThrow()).mode).toBe('multi');
	});

	it('does not leave the first-admin flag set after a call returns or throws', async () => {
		const { db, auth, instance } = await setup();
		await expect(
			createFirstAdmin({ instance, auth: failingAfterUser(auth), db }, admin)
		).rejects.toThrow();
		expect(isFirstAdmin()).toBe(false);
		await createFirstAdmin({ instance, auth, db }, admin);
		expect(isFirstAdmin()).toBe(false);
	});

	it.each([
		['absent', false],
		['local', true]
	])(
		'refuses, and keeps the existing admin, when an Account exists but the Instance row is %s',
		async (_, local) => {
			const { db, auth, instance } = await setup();
			await createFirstAdmin({ instance, auth, db }, admin);
			await db.instance.deleteMany();
			if (local) await db.instance.create({ data: { mode: 'local' } });
			const restored = await createInstance(db);

			await expect(
				createFirstAdmin({ instance: restored, auth, db }, { ...admin, email: 'two@example.com' })
			).rejects.toThrow(InstanceAlreadySetUpError);

			expect(await db.user.findMany()).toEqual([expect.objectContaining({ email: admin.email })]);
			expect(restored.mode()).toBe(local ? 'local' : null);
			expect(await db.instance.count()).toBe(local ? 1 : 0);
		}
	);

	it.each([
		['one Instance object', false],
		['two Instance objects', true]
	])('gives exactly one outcome when the first admin races chooseLocal (%s)', async (_, two) => {
		for (let round = 0; round < 3; round++) {
			const { db, auth, instance } = await setup();
			const local = two ? await createInstance(db) : instance;

			const [admin1, local1] = await Promise.allSettled([
				createFirstAdmin({ instance, auth, db }, admin),
				local.chooseLocal()
			]);

			expect([admin1.status, local1.status].sort()).toEqual(['fulfilled', 'rejected']);
			const stored = (await db.instance.findFirstOrThrow()).mode;
			expect(stored).toBe(admin1.status === 'fulfilled' ? 'multi' : 'local');
			expect(await db.user.count()).toBe(admin1.status === 'fulfilled' ? 1 : 0);
		}
	});

	it('logs, rethrows the sign-up error and stays closed when the rollback fails after the delete', async () => {
		const { db, auth, instance } = await setup();
		const failingUndo = {
			...instance,
			chooseMulti: async () => {
				await instance.chooseMulti();
				return {
					undo: async () => {
						throw new Error('undo failed');
					}
				};
			}
		};
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			createFirstAdmin({ instance: failingUndo, auth: failingAfterUser(auth), db }, admin)
		).rejects.toThrow(/session store down/);

		expect(logged).toHaveBeenCalledOnce();
		expect(JSON.stringify(logged.mock.calls)).not.toContain(admin.password);
		logged.mockRestore();
		expect(await db.user.count()).toBe(0);
		expect(instance.mode()).toBe('multi');
		await expect(
			auth.api.signUpEmail({ body: { ...admin, email: 'eve@example.com' } })
		).rejects.toMatchObject({ statusCode: 403 });
		// Closed for good: Setup cannot run again (the way back is the reset-admin-password command).
		await expect(createFirstAdmin({ instance, auth, db }, admin)).rejects.toThrow(
			InstanceAlreadySetUpError
		);
	});

	it.each([
		['an empty name', { name: '  ' }, 'name'],
		['a bad email', { email: 'a@b' }, 'email'],
		['a 129-character password', { password: 'a'.repeat(129) }, 'password'],
		['an 11-character password', { password: 'a'.repeat(11) }, 'password']
	])('refuses %s before touching the Instance, naming the field', async (_, bad, field) => {
		const { db, auth, instance } = await setup();

		await expect(
			createFirstAdmin({ instance, auth, db }, { ...admin, ...bad })
		).rejects.toMatchObject({
			name: 'InvalidFirstAdminError',
			field
		});

		expect(instance.mode()).toBeNull();
		expect(await db.instance.count()).toBe(0);
	});

	it('refuses a real sign-up made while the first-admin scope is live, over HTTP and auth.api', async () => {
		const db = await createFileTestDb();
		const instance = await createInstance(db);
		const gate = createRegistration({ instance });
		let release: () => void = () => {};
		const latch = new Promise<void>((resolve) => {
			release = resolve;
		});
		const auth = createAuth({
			db,
			origin: 'http://localhost:3000',
			secret,
			admitSignUp: async (a) => {
				if (a.email === admin.email) {
					release();
					await new Promise((resolve) => setTimeout(resolve, 20));
				} else {
					await latch;
				}
				return gate(a);
			}
		});
		const eve = { name: 'Eve', email: 'eve@example.com', password: 'correct horse battery' };
		const http = auth.handler(
			new Request('http://localhost:3000/api/auth/sign-up/email', {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
				body: JSON.stringify(eve)
			})
		);
		const direct = auth.api.signUpEmail({ body: { ...eve, email: 'eve2@example.com' } });

		const [first, httpRes, directRes] = await Promise.allSettled([
			createFirstAdmin({ instance, auth, db }, admin),
			http,
			direct
		]);

		expect(first.status).toBe('fulfilled');
		expect(httpRes.status === 'fulfilled' && httpRes.value.status).toBe(403);
		expect(directRes.status).toBe('rejected');
		expect((await db.user.findMany()).map((u) => u.email)).toEqual([admin.email]);
	});

	it('leaves a plain sign-up refused afterwards, over HTTP and through auth.api', async () => {
		const { db, auth, instance } = await setup();
		await createFirstAdmin({ instance, auth, db }, admin);
		const other = { name: 'Eve', email: 'eve@example.com', password: 'correct horse battery' };

		await expect(auth.api.signUpEmail({ body: other })).rejects.toMatchObject({ statusCode: 403 });
		const res = await auth.handler(
			new Request('http://localhost:3000/api/auth/sign-up/email', {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
				body: JSON.stringify(other)
			})
		);
		expect(res.status).toBe(403);
		expect(await db.user.count()).toBe(1);
	});
});
