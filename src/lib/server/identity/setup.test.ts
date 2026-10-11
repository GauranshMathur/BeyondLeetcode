import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
import { createInstance } from '../instance.ts';
import { createLearningCore } from '../learning/core.ts';
import { createFileTestDb } from '../test-db.ts';
import { createAuth } from './auth.ts';
import { createMultiUserIdentity } from './multi-user.ts';
import { createRegistration } from './registration.ts';
import { createFirstAdmin } from './setup.ts';

const fixtureDir = fileURLToPath(new URL('../content/fixture', import.meta.url));
const secret = 'test-secret-test-secret-test-secret-0123';
const admin = { name: 'Root', email: 'root@example.com', password: 'correct horse battery' };

async function setup() {
	const db = await createFileTestDb();
	const auth = createAuth({
		db,
		origin: 'http://localhost:3000',
		secret,
		admitSignUp: createRegistration()
	});
	const instance = await createInstance(db);
	const core = createLearningCore({ catalogue: await loadCatalogue(fixtureDir), db });
	return { db, auth, instance, core };
}

const cookieOf = (headers: Headers) =>
	headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');

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
			createFirstAdmin({ instance: other, auth }, { ...admin, email: 'two@example.com' })
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
			createFirstAdmin({ instance, auth, db }, { ...admin, email: 'not-an-email' })
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
			createFirstAdmin({ instance, auth, db }, { ...admin, email: 'not-an-email' })
		).rejects.toThrow();

		expect(instance.mode()).toBe('local');
	});

	it('removes the half-made Account but keeps Local progress when sign-up fails after the user row', async () => {
		const { db, auth, instance, core } = await setup();
		await instance.chooseLocal();
		await db.learner.create({ data: { id: 'local' } });
		await core.forLearner('local').reachChapterEnd('stacks-undo-log');
		const failing = {
			...auth,
			api: {
				...auth.api,
				signUpEmail: async (...args: Parameters<typeof auth.api.signUpEmail>) => {
					await auth.api.signUpEmail(...args);
					throw new Error('session store down');
				}
			}
		} as typeof auth;

		await expect(createFirstAdmin({ instance, auth: failing, db }, admin)).rejects.toThrow(
			/session store down/
		);

		expect(await db.user.count()).toBe(0);
		expect(instance.mode()).toBe('local');
		expect((await core.forLearner('local').chapter('stacks-undo-log')).read).toBe(true);
		await expect(createFirstAdmin({ instance, auth, db }, admin)).resolves.toBeTruthy();
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
