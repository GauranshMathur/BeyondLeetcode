import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { createApp } from './app.ts';
import { createDb } from './db.ts';
import { INVITE_COOKIE } from './identity/auth.ts';

it('fails at start with a clear message when CONTENT_DIR is missing', async () => {
	await expect(createApp({ DATABASE_URL: 'file:x.db' })).rejects.toThrow(/CONTENT_DIR is not set/);
});

it('fails at start with a clear message when DATABASE_URL is missing', async () => {
	await expect(createApp({ CONTENT_DIR: 'content' })).rejects.toThrow(/DATABASE_URL is not set/);
});

it('fails at start with a clear message when RUNNER_URL or RUNNER_TOKEN is missing', async () => {
	const base = { CONTENT_DIR: 'content', DATABASE_URL: 'file:x.db' };
	await expect(createApp({ ...base, RUNNER_TOKEN: 't' })).rejects.toThrow(/RUNNER_URL is not set/);
	await expect(createApp({ ...base, RUNNER_URL: 'http://localhost:8787' })).rejects.toThrow(
		/RUNNER_TOKEN is not set/
	);
});

it('refuses the test Learner switch in production', async () => {
	const base = {
		CONTENT_DIR: 'content',
		DATABASE_URL: 'file:x.db',
		RUNNER_URL: 'http://r',
		RUNNER_TOKEN: 't'
	};
	await expect(
		createApp({ ...base, IDENTITY_TEST_LEARNER: '1', NODE_ENV: 'production' })
	).rejects.toThrow(/test Learner switch is for the browser tests only/);
});

async function migratedDatabase() {
	const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-app-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	const url = `file:${join(dir, 'app.db')}`;
	execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
		env: { ...process.env, DATABASE_URL: url },
		stdio: 'pipe'
	});
	const db = createDb(url);
	onTestFinished(() => db.$disconnect());
	return { url, db };
}

const boot = (url: string, extra: Record<string, string | undefined> = {}) =>
	createApp({
		CONTENT_DIR: 'src/lib/server/content/fixture',
		DATABASE_URL: url,
		RUNNER_URL: 'http://127.0.0.1:1',
		RUNNER_TOKEN: 'test-token',
		...extra
	});

it('a fresh database stays not set up across restarts, with no Learner, until someone chooses', async () => {
	const { url, db } = await migratedDatabase();

	expect((await boot(url)).instance.mode()).toBeNull();
	const second = await boot(url);
	expect(second.instance.mode()).toBeNull();
	expect(await db.learner.count()).toBe(0);

	await second.instance.chooseLocal();
	expect(second.instance.mode()).toBe('local');
	expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: 'local' })]);
}, 30_000);

it('an upgraded database that already has the Local mode gets its Local Learner at boot', async () => {
	const { url, db } = await migratedDatabase();
	await db.instance.create({ data: { mode: 'local' } });

	const app = await boot(url);

	expect(app.instance.mode()).toBe('local');
	expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: 'local' })]);
}, 30_000);

const secret = 'a-test-secret-of-at-least-thirty-two-characters';
const admin = { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' };

const bootMulti = (url: string, extra: Record<string, string | undefined> = {}) =>
	createApp({
		CONTENT_DIR: 'src/lib/server/content/fixture',
		DATABASE_URL: url,
		RUNNER_ADAPTER: 'scripted',
		IDENTITY_TEST_LEARNER: '1',
		BETTER_AUTH_SECRET: secret,
		ORIGIN: 'http://localhost:4174',
		...extra
	});

describe('Multi-user', () => {
	it('can be chosen on a server without the test switch once the secret and origin are set, and signs the admin in', async () => {
		const { url, db } = await migratedDatabase();
		const app = await boot(url, { BETTER_AUTH_SECRET: secret, ORIGIN: 'http://localhost:4174' });
		expect(app.setup.multiUser).toEqual({ kind: 'open' });

		const { headers } = await app.setup.createFirstAdmin(admin);

		expect(app.instance.mode()).toBe('multi');
		const cookie = headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		const who = await app.multiUser?.identity.resolve({
			cookies: { get: () => undefined },
			request: { headers: new Headers({ cookie }) }
		});
		expect(who).toMatchObject({ displayName: 'Ada', role: 'admin', learnerId: 'local' });
		// Invite links carry the validated ORIGIN, the one Better Auth uses.
		const made = await app.multiUser?.invites.create({ who: who as never, now: new Date() });
		expect(made?.link).toBe(`http://localhost:4174/invite/${made?.token}`);
		expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: 'local' })]);
	}, 30_000);

	it('wires the Learner remover to this database, for removing an Account', async () => {
		const { url, db } = await migratedDatabase();
		const app = await boot(url, { BETTER_AUTH_SECRET: secret, ORIGIN: 'http://localhost:4174' });
		await db.learner.create({ data: { id: 'gone' } });
		await db.chapterRead.create({ data: { learnerId: 'gone', chapterId: 'c' } });

		await app.multiUser?.deleteLearner('gone');

		expect(await db.learner.count({ where: { id: 'gone' } })).toBe(0);
		expect(await db.chapterRead.count({ where: { learnerId: 'gone' } })).toBe(0);
	}, 30_000);

	it('lets an Invite create exactly one learner Account through the wired auth, and refuses a second use', async () => {
		const { url, db } = await migratedDatabase();
		const app = await boot(url, { BETTER_AUTH_SECRET: secret, ORIGIN: 'http://localhost:4174' });
		const { headers } = await app.setup.createFirstAdmin(admin);
		const cookie = headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		const who = await app.multiUser?.identity.resolve({
			cookies: { get: () => undefined },
			request: { headers: new Headers({ cookie }) }
		});
		const made = await app.multiUser?.invites.create({ who: who as never, now: new Date() });
		const signUp = async (email: string) => {
			try {
				await app.multiUser?.auth.api.signUpEmail({
					body: { name: 'Lin', email, password: 'a long enough secret' },
					headers: new Headers({ cookie: `${INVITE_COOKIE}=${made?.token}` })
				});
				return 200;
			} catch (error) {
				return (error as { statusCode?: number }).statusCode;
			}
		};

		expect(await signUp('lin@example.com')).toBe(200);
		expect(await signUp('lin2@example.com')).toBe(403);

		const learners = await db.user.findMany({ where: { role: 'learner' } });
		expect(learners).toHaveLength(1);
		expect(await app.multiUser?.invites.lookup(made?.token ?? '', new Date())).toBeNull();
	}, 30_000);

	it('says what to add to .env on a server without the test switch and without a secret', async () => {
		const { url } = await migratedDatabase();

		const app = await boot(url);

		expect(app.setup.multiUser).toEqual({
			kind: 'needs-env',
			message: expect.stringMatching(/BETTER_AUTH_SECRET.*\.env/s)
		});
		await expect(app.setup.createFirstAdmin(admin)).rejects.toThrow(/not available/);
		expect(app.instance.mode()).toBeNull();
	}, 30_000);

	it('can be chosen on the test server too, once the secret and origin are set', async () => {
		const { url, db } = await migratedDatabase();
		const app = await bootMulti(url);
		expect(app.setup.multiUser).toEqual({ kind: 'open' });

		const { headers } = await app.setup.createFirstAdmin(admin);

		expect(app.instance.mode()).toBe('multi');
		const cookie = headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		const who = await app.multiUser?.identity.resolve({
			cookies: { get: () => undefined },
			request: { headers: new Headers({ cookie }) }
		});
		expect(who).toMatchObject({ displayName: 'Ada', role: 'admin', learnerId: 'local' });
		expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: 'local' })]);
	}, 30_000);

	it.each([
		['no secret', { BETTER_AUTH_SECRET: undefined }, /BETTER_AUTH_SECRET.*\.env/s],
		['an empty secret', { BETTER_AUTH_SECRET: '' }, /BETTER_AUTH_SECRET.*\.env/s],
		['a short secret', { BETTER_AUTH_SECRET: 'short' }, /BETTER_AUTH_SECRET.*32/s],
		[
			'the .env.example placeholder',
			{ BETTER_AUTH_SECRET: 'change-me-to-a-random-string-of-48-characters' },
			/BETTER_AUTH_SECRET.*placeholder/s
		],
		[
			"Better Auth's built-in default",
			{ BETTER_AUTH_SECRET: 'better-auth-secret-12345678901234567890' },
			/BETTER_AUTH_SECRET.*placeholder/s
		],
		['no origin', { ORIGIN: undefined }, /ORIGIN.*\.env/s],
		['an empty origin', { ORIGIN: '' }, /ORIGIN.*\.env/s],
		['an origin that is not a URL', { ORIGIN: 'learn.example.com' }, /ORIGIN.*\.env/s],
		['an origin of another scheme', { ORIGIN: 'ftp://learn.example.com' }, /ORIGIN.*\.env/s]
	])(
		'explains what to add to .env instead of building Better Auth: %s',
		async (_, extra, message) => {
			const { url } = await migratedDatabase();

			const app = await bootMulti(url, extra);

			expect(app.multiUser).toBeNull();
			expect(app.setup.multiUser).toEqual({
				kind: 'needs-env',
				message: expect.stringMatching(message)
			});
			await expect(app.setup.createFirstAdmin(admin)).rejects.toThrow(/not available/);
			expect(app.instance.mode()).toBeNull();
		},
		30_000
	);

	it('derives the auth origin from ORIGIN: http gives cookies a plain http browser keeps', async () => {
		const { url } = await migratedDatabase();
		const app = await bootMulti(url, { ORIGIN: 'http://192.168.1.20:3000/' });

		const { headers } = await app.setup.createFirstAdmin(admin);

		const [cookie] = headers.getSetCookie();
		expect(cookie).toMatch(/^better-auth\.session_token=/);
		expect(cookie).not.toMatch(/secure/i);
	}, 30_000);

	it('gives an https origin Secure cookies', async () => {
		const { url } = await migratedDatabase();
		const app = await bootMulti(url, { ORIGIN: 'https://learn.example.com' });

		const { headers } = await app.setup.createFirstAdmin(admin);

		expect(headers.getSetCookie()[0]).toMatch(/^__Secure-better-auth\.session_token=.*; Secure/i);
	}, 30_000);

	it('refuses to start as a multi-user Instance with the test switch on: the test cookie must never be read', async () => {
		const { url, db } = await migratedDatabase();
		await db.instance.create({ data: { mode: 'multi' } });

		await expect(bootMulti(url)).rejects.toThrow(/IDENTITY_TEST_LEARNER/);
	}, 30_000);

	it('refuses to start as a multi-user Instance without its secret or origin', async () => {
		const { url, db } = await migratedDatabase();
		await db.instance.create({ data: { mode: 'multi' } });
		const env = { BETTER_AUTH_SECRET: secret, ORIGIN: 'http://localhost:4174' };

		await expect(boot(url, { ...env, BETTER_AUTH_SECRET: undefined })).rejects.toThrow(
			/Multi-user.*BETTER_AUTH_SECRET/s
		);
		await expect(boot(url, { ...env, ORIGIN: '' })).rejects.toThrow(/Multi-user.*ORIGIN/s);
		await expect(
			boot(url, { ...env, BETTER_AUTH_SECRET: 'change-me-to-a-random-string-of-48-characters' })
		).rejects.toThrow(/Multi-user.*placeholder/s);
		await expect(
			boot(url, { ...env, BETTER_AUTH_SECRET: 'better-auth-secret-12345678901234567890' })
		).rejects.toThrow(/Multi-user.*placeholder/s);
		expect(await boot(url, env)).toMatchObject({ multiUser: expect.anything() });
	}, 30_000);
});

describe('Better Auth settings the environment could override', () => {
	// Better Auth reads both from process.env on its own: the first replaces the secret createAuth is
	// given, the second adds origins to the ones its origin check accepts.
	const overrides = ['BETTER_AUTH_SECRETS', 'BETTER_AUTH_TRUSTED_ORIGINS'];
	const value = 'v1:never-printed-by-the-error-0123456789abcdef0123456789abcdef';

	it.each(overrides)(
		'%s: refuses to start on a fresh, Local or multi-user Instance',
		async (name) => {
			const { url, db } = await migratedDatabase();
			const env = { BETTER_AUTH_SECRET: secret, ORIGIN: 'http://localhost:4174' };
			const message = new RegExp(`${name} is set`);
			vi.stubEnv(name, value);
			onTestFinished(() => void vi.unstubAllEnvs());

			await expect(boot(url, env)).rejects.toThrow(message); // not set up yet
			await db.instance.create({ data: { mode: 'local' } });
			await expect(boot(url, env)).rejects.toThrow(message);
			await db.instance.deleteMany();
			await db.instance.create({ data: { mode: 'multi' } });
			await expect(boot(url, env)).rejects.toThrow(message);

			// A fixed string: it names the variable and never echoes its value.
			const error = await boot(url, env).catch((e: Error) => e);
			expect((error as Error).message).not.toContain(value);

			// Unset, the same multi-user Instance starts.
			vi.unstubAllEnvs();
			expect(await boot(url, env)).toMatchObject({ multiUser: expect.anything() });
		},
		30_000
	);

	it('lets an empty value through: Better Auth ignores it', async () => {
		const { url } = await migratedDatabase();
		for (const name of overrides) vi.stubEnv(name, '');
		onTestFinished(() => void vi.unstubAllEnvs());

		expect((await boot(url)).instance.mode()).toBeNull();
	}, 30_000);

	it.each(overrides)('%s: refuses before reading content or the database', async (name) => {
		vi.stubEnv(name, value);
		onTestFinished(() => void vi.unstubAllEnvs());

		await expect(
			createApp({ CONTENT_DIR: 'does-not-exist', DATABASE_URL: 'file:/does/not/exist.db' })
		).rejects.toThrow(new RegExp(`${name} is set`));
	});
});

describe('Runner adapter', () => {
	const base = { CONTENT_DIR: 'src/lib/server/content/fixture', DATABASE_URL: 'file:x.db' };

	it('builds the HTTP adapter unless RUNNER_ADAPTER asks otherwise: the Runner settings stay required', async () => {
		await expect(createApp({ ...base })).rejects.toThrow(/RUNNER_URL is not set/);
		await expect(createApp({ ...base, RUNNER_ADAPTER: 'http' })).rejects.toThrow(
			/RUNNER_URL is not set/
		);
	});

	it('builds the scripted adapter, with no Runner settings, when RUNNER_ADAPTER=scripted', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-app-'));
		onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
		const DATABASE_URL = `file:${join(dir, 'app.db')}`;
		execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
			env: { ...process.env, DATABASE_URL },
			stdio: 'pipe'
		});

		const app = await createApp({
			...base,
			DATABASE_URL,
			RUNNER_ADAPTER: 'scripted',
			IDENTITY_TEST_LEARNER: '1'
		});

		const learner = app.core.forLearner('someone');
		const problem = await learner.problem('stacks-push');
		const reference = (await learner.solution('stacks-push')).referenceCode.python;
		const submitted = await learner.submit(problem.build, reference);
		expect(submitted.verdict).toBe('Accepted');
	}, 30_000);

	it('refuses the scripted adapter without the e2e test switch, whatever NODE_ENV is', async () => {
		await expect(createApp({ ...base, RUNNER_ADAPTER: 'scripted' })).rejects.toThrow(
			/browser tests only/
		);
		await expect(
			createApp({ ...base, RUNNER_ADAPTER: 'scripted', NODE_ENV: 'development' })
		).rejects.toThrow(/browser tests only/);
	});

	it('refuses the scripted adapter in production even with the e2e test switch', async () => {
		await expect(
			createApp({
				...base,
				RUNNER_ADAPTER: 'scripted',
				IDENTITY_TEST_LEARNER: '1',
				NODE_ENV: 'production'
			})
		).rejects.toThrow(/browser tests only/);
	});

	it('refuses an unknown adapter name', async () => {
		await expect(createApp({ ...base, RUNNER_ADAPTER: 'docker' })).rejects.toThrow(
			/RUNNER_ADAPTER/
		);
	});
});
