import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
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

const boot = (url: string) =>
	createApp({
		CONTENT_DIR: 'src/lib/server/content/fixture',
		DATABASE_URL: url,
		RUNNER_URL: 'http://127.0.0.1:1',
		RUNNER_TOKEN: 'test-token'
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
