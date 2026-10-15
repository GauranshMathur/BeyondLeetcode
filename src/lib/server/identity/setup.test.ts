import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
import { createInstance, InstanceAlreadySetUpError } from '../instance.ts';
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
			mustChangePassword: false
		});
	});

	it('on a Local Instance with progress, the admin sees that progress on the Map', async () => {
		const { db, auth, instance, core } = await setup();
		await instance.chooseLocal();
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

	it('puts a Local Instance back to local when sign-up fails after the claim', async () => {
		const { auth, instance, db } = await setup();
		await instance.chooseLocal();

		await expect(
			createFirstAdmin({ instance, auth: failingAfterUser(auth), db }, admin)
		).rejects.toThrow();

		expect(instance.mode()).toBe('local');
		expect((await db.instance.findFirstOrThrow()).mode).toBe('local');
	});

	it('removes the half-made Account but keeps Local progress when sign-up fails after the user row', async () => {
		const { db, auth, instance, core } = await setup();
		await instance.chooseLocal();
		await db.learner.create({ data: { id: 'local' } });
		await core.forLearner('local').reachChapterEnd('stacks-undo-log');
		const failing = failingAfterUser(auth);

		await expect(createFirstAdmin({ instance, auth: failing, db }, admin)).rejects.toThrow(
			/session store down/
		);

		expect(await db.user.count()).toBe(0);
		expect(instance.mode()).toBe('local');
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

	it('can run again on a multi Instance with no Accounts', async () => {
		const { db, auth } = await setup();
		await db.instance.create({ data: { mode: 'multi' } });
		const instance = await createInstance(db);

		await expect(createFirstAdmin({ instance, auth, db }, admin)).resolves.toBeTruthy();

		expect(await db.user.count()).toBe(1);
		await expect(
			createFirstAdmin({ instance, auth, db }, { ...admin, email: 'two@example.com' })
		).rejects.toThrow(InstanceAlreadySetUpError);
	});

	it('gives one admin when two calls race on a multi Instance with no Accounts', async () => {
		const { db, auth } = await setup();
		await db.instance.create({ data: { mode: 'multi' } });
		const [a, b] = [await createInstance(db), await createInstance(db)];

		const results = await Promise.allSettled([
			createFirstAdmin({ instance: a, auth, db }, admin),
			createFirstAdmin({ instance: b, auth, db }, { ...admin, email: 'two@example.com' })
		]);

		expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
		expect(await db.user.count()).toBe(1);
		expect(await db.user.findFirstOrThrow()).toMatchObject({ email: admin.email, role: 'admin' });
	});

	it('gives one admin when two calls race on a Local Instance, with one Instance object or two', async () => {
		for (const shared of [true, false]) {
			const { db, auth, instance } = await setup();
			await instance.chooseLocal();
			const second = shared ? instance : await createInstance(db);

			const results = await Promise.allSettled([
				createFirstAdmin({ instance, auth, db }, admin),
				createFirstAdmin({ instance: second, auth, db }, { ...admin, email: 'two@example.com' })
			]);

			expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
			expect(await db.user.count()).toBe(1);
			expect((await db.instance.findFirstOrThrow()).mode).toBe('multi');
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
		await expect(createFirstAdmin({ instance, auth, db }, admin)).resolves.toBeTruthy();
	});

	it.each([
		['an empty name', { name: '  ' }],
		['a bad email', { email: 'a@b' }],
		['a 129-character password', { password: 'a'.repeat(129) }]
	])('refuses %s before touching the Instance', async (_, bad) => {
		const { db, auth, instance } = await setup();

		await expect(createFirstAdmin({ instance, auth, db }, { ...admin, ...bad })).rejects.toThrow();

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
