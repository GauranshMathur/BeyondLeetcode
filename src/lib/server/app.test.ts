import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createApp } from './app.ts';
import { createDb } from './db.ts';

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

describe('OAuth providers', () => {
	const github = { GITHUB_CLIENT_ID: 'gh-id', GITHUB_CLIENT_SECRET: 'gh-secret' };
	const providersOf = async (extra: Record<string, string | undefined>) => {
		const { url } = await migratedDatabase();
		const app = await bootMulti(url, extra);
		return app.multiUser ? app.multiUser.accounts.providers().map((p) => p.id) : null;
	};
	beforeEach(() => {
		// The process environment is the fallback, so the tests start from a clean one.
		for (const name of [
			'GITHUB_CLIENT_ID',
			'GITHUB_CLIENT_SECRET',
			'GOOGLE_CLIENT_ID',
			'GOOGLE_CLIENT_SECRET'
		]) {
			vi.stubEnv(name, '');
		}
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('adds GitHub only when both of its variables are set', async () => {
		expect(await providersOf({})).toEqual([]);
		expect(await providersOf({ GITHUB_CLIENT_ID: 'gh-id' })).toEqual([]);
		expect(await providersOf({ GITHUB_CLIENT_SECRET: 'gh-secret' })).toEqual([]);
		expect(await providersOf(github)).toEqual(['github']);
	}, 60_000);

	it('adds each provider on its own pair', async () => {
		expect(
			await providersOf({ ...github, GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' })
		).toEqual(['github', 'google']);
		expect(
			await providersOf({ GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' })
		).toEqual(['google']);
	}, 60_000);

	it('reads the process environment when the caller passes none', async () => {
		vi.stubEnv('GITHUB_CLIENT_ID', 'gh-id');
		vi.stubEnv('GITHUB_CLIENT_SECRET', 'gh-secret');
		expect(await providersOf({})).toEqual(['github']);
	}, 60_000);
});

describe('Multi-user', () => {
	it('can be chosen on a server without the test switch once the secret and origin are set, and signs the admin in through the app', async () => {
		const { url } = await migratedDatabase();
		const app = await boot(url, { BETTER_AUTH_SECRET: secret, ORIGIN: 'http://localhost:4174' });
		expect(app.setup.multiUser).toEqual({ kind: 'open' });

		const { headers } = await app.setup.createFirstAdmin(admin);

		const cookie = headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		const answer = await app.identity.resolve({
			cookies: { get: () => undefined },
			request: { headers: new Headers({ cookie }) }
		});
		const who = answer.kind === 'resolved' ? answer.who : null;
		expect(who).toMatchObject({ displayName: 'Ada', role: 'admin', learnerId: 'local' });
	}, 30_000);

	it('derives the auth origin from ORIGIN: http gives cookies a plain http browser keeps', async () => {
		const { url } = await migratedDatabase();
		const app = await bootMulti(url, { ORIGIN: 'http://192.168.1.20:3000/' });

		const { headers } = await app.setup.createFirstAdmin(admin);

		const [cookie] = headers.getSetCookie();
		expect(cookie).toMatch(/^better-auth\.session_token=/);
		expect(cookie).not.toMatch(/secure/i);
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
		const answer = await app.identity.resolve({
			cookies: { get: () => undefined },
			request: { headers: new Headers({ cookie }) }
		});
		const who = answer.kind === 'resolved' ? answer.who : null;
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

		// Progress needs its Learner's row; the web server's identity makes it, the test makes it here.
		const db = createDb(DATABASE_URL);
		onTestFinished(() => db.$disconnect());
		await db.learner.create({ data: { id: 'someone' } });
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

describe('dev mode', () => {
	const devModeOf = async (extra: Record<string, string | undefined>) => {
		const { url, db } = await migratedDatabase();
		await db.instance.create({ data: { mode: 'local' } });
		return (await boot(url, extra)).devMode;
	};

	it('is off unless the switch is exactly 1', async () => {
		expect(await devModeOf({})).toBe(false);
		for (const value of ['', '0', 'true', 'yes', ' 1', '1 ', '01', 'on']) {
			expect(await devModeOf({ DEV_MODE: value }), JSON.stringify(value)).toBe(false);
		}
	}, 60_000);

	it('is on for 1 in Local Mode, also with NODE_ENV=production', async () => {
		expect(await devModeOf({ DEV_MODE: '1' })).toBe(true);
		expect(await devModeOf({ DEV_MODE: '1', NODE_ENV: 'production' })).toBe(true);
	}, 30_000);

	it('is off when the instance is not set up yet, even with the switch on', async () => {
		const { url } = await migratedDatabase();
		const app = await boot(url, { DEV_MODE: '1' });
		expect(app.devMode).toBe(false);
		await app.instance.chooseLocal();
		expect(app.devMode).toBe(false);
	}, 30_000);

	it('cannot be assigned after start', async () => {
		const { url, db } = await migratedDatabase();
		await db.instance.create({ data: { mode: 'local' } });
		const app = await boot(url);
		expect(() => {
			(app as { devMode: boolean }).devMode = true;
		}).toThrow(TypeError);
		expect(app.devMode).toBe(false);
	}, 30_000);

	it('is read once at start: a later change to the process environment does not move it', async () => {
		const { url, db } = await migratedDatabase();
		await db.instance.create({ data: { mode: 'local' } });
		const off = await boot(url);
		const on = await boot(url, { DEV_MODE: '1' });
		onTestFinished(() => {
			vi.unstubAllEnvs();
		});
		vi.stubEnv('DEV_MODE', '1');
		expect(off.devMode).toBe(false);
		vi.stubEnv('DEV_MODE', '0');
		expect(on.devMode).toBe(true);
		// A later start reads the env argument, not the process environment.
		expect((await boot(url)).devMode).toBe(false);
	}, 60_000);

	const multiEnv = {
		BETTER_AUTH_SECRET: secret,
		ORIGIN: 'http://localhost:4174'
	};
	const convertInput = { ...admin, convert: true };

	it('a Local Instance started in dev mode cannot be converted to Multi-user, by Setup or directly', async () => {
		const { url, db } = await migratedDatabase();
		await db.instance.create({ data: { mode: 'local' } });
		const app = await boot(url, { ...multiEnv, DEV_MODE: '1' });
		await db.learner.upsert({ where: { id: 'local' }, update: {}, create: { id: 'local' } });

		await expect(app.setup.createFirstAdmin(convertInput)).rejects.toThrow(/Dev mode is on/);
		await expect(app.instance.chooseMulti()).rejects.toThrow(/Dev mode is on/);

		expect(app.instance.mode()).toBe('local');
		expect((await db.instance.findUnique({ where: { id: 'instance' } }))?.mode).toBe('local');
		expect(await db.user.count()).toBe(0);
		expect(app.devMode).toBe(true);
	}, 60_000);

	it('a Local Instance started without the switch still converts', async () => {
		const { url, db } = await migratedDatabase();
		await db.instance.create({ data: { mode: 'local' } });
		const app = await boot(url, multiEnv);

		await app.setup.createFirstAdmin(convertInput);

		expect(app.instance.mode()).toBe('multi');
		expect(app.devMode).toBe(false);
	}, 60_000);

	it('a fresh Instance with the switch set may choose Multi-user, and the next start refuses', async () => {
		const { url } = await migratedDatabase();
		const app = await boot(url, { ...multiEnv, DEV_MODE: '1' });
		expect(app.devMode).toBe(false);

		await app.setup.createFirstAdmin({ ...admin });

		expect(app.instance.mode()).toBe('multi');
		expect(app.devMode).toBe(false);
		await expect(boot(url, { ...multiEnv, DEV_MODE: '1' })).rejects.toThrow(/DEV_MODE=1/);
	}, 60_000);

	it('a fresh Instance with the switch set that chooses Local has it off here and on after a restart', async () => {
		const { url } = await migratedDatabase();
		const app = await boot(url, { DEV_MODE: '1' });
		await app.instance.chooseLocal();
		expect(app.devMode).toBe(false);

		expect((await boot(url, { DEV_MODE: '1' })).devMode).toBe(true);
	}, 60_000);

	it('mutating the env object after start, or setting process.env while the argument omits the switch, changes nothing', async () => {
		const { url, db } = await migratedDatabase();
		await db.instance.create({ data: { mode: 'local' } });
		const env: Record<string, string | undefined> = {
			CONTENT_DIR: 'src/lib/server/content/fixture',
			DATABASE_URL: url,
			RUNNER_URL: 'http://127.0.0.1:1',
			RUNNER_TOKEN: 'test-token',
			DEV_MODE: '1'
		};
		const on = await createApp(env);
		env.DEV_MODE = '0';
		expect(on.devMode).toBe(true);

		onTestFinished(() => {
			vi.unstubAllEnvs();
		});
		vi.stubEnv('DEV_MODE', '1');
		delete env.DEV_MODE;
		expect((await createApp(env)).devMode).toBe(false);
	}, 60_000);

	it('refuses to start a multi-user Instance with the switch set, in production or not', async () => {
		const { url, db } = await migratedDatabase();
		await db.instance.create({ data: { mode: 'multi' } });
		const multi = {
			CONTENT_DIR: 'src/lib/server/content/fixture',
			DATABASE_URL: url,
			RUNNER_URL: 'http://127.0.0.1:1',
			RUNNER_TOKEN: 'test-token',
			BETTER_AUTH_SECRET: secret,
			ORIGIN: 'http://localhost:4174',
			DEV_MODE: '1'
		};
		await expect(createApp(multi)).rejects.toThrow(/DEV_MODE=1 on a multi-user Instance/);
		await expect(createApp({ ...multi, NODE_ENV: 'production' })).rejects.toThrow(/DEV_MODE/);
		const { DEV_MODE: _off, ...without } = multi;
		expect((await createApp(without)).devMode).toBe(false);
	}, 60_000);

	it('the core the app builds agrees with the switch: a Locked Topic opens for a fresh Learner only with it on', async () => {
		const openLast = async (extra: Record<string, string | undefined>) => {
			const { url, db } = await migratedDatabase();
			await db.instance.create({ data: { mode: 'local' } });
			await db.learner.create({ data: { id: 'fresh' } });
			const app = await boot(url, extra);
			return { app, learner: app.core.forLearner('fresh') };
		};
		const on = await openLast({ DEV_MODE: '1' });
		expect(on.app.devMode).toBe(true);
		expect((await on.learner.topic('heaps')).id).toBe('heaps');

		const off = await openLast({});
		expect(off.app.devMode).toBe(false);
		await expect(off.learner.topic('heaps')).rejects.toMatchObject({ code: 'TopicLocked' });
	}, 60_000);
});
