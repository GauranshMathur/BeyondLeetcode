import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { createDb } from './db';

test('migrations apply to a fresh file database that createDb then uses', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-db-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	const url = `file:${join(dir, 'fresh.db')}`;

	execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
		env: { ...process.env, DATABASE_URL: url },
		stdio: 'pipe'
	});

	const db = createDb(url);
	onTestFinished(() => db.$disconnect());
	const learner = await db.learner.create({ data: {} });
	expect(await db.learner.findUnique({ where: { id: learner.id } })).toEqual(learner);
}, 30_000);
