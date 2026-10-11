import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createApp } from './app.ts';

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

		const app = await createApp({ ...base, DATABASE_URL, RUNNER_ADAPTER: 'scripted' });

		const learner = app.core.forLearner('someone');
		const problem = await learner.problem('stacks-push');
		const reference = (await learner.solution('stacks-push')).referenceCode.python;
		const submitted = await learner.submit(problem.build, reference);
		expect(submitted.verdict).toBe('Accepted');
	}, 30_000);

	it('refuses the scripted adapter in production', async () => {
		await expect(
			createApp({ ...base, RUNNER_ADAPTER: 'scripted', NODE_ENV: 'production' })
		).rejects.toThrow(/scripted/);
	});

	it('refuses an unknown adapter name', async () => {
		await expect(createApp({ ...base, RUNNER_ADAPTER: 'docker' })).rejects.toThrow(
			/RUNNER_ADAPTER/
		);
	});
});
