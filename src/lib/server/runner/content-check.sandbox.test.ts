import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
import { judge, submitPlan } from '../learning/rules.ts';
import { sandboxConfig } from './config.ts';
import { createEngine } from './engine.ts';
import type { ExecuteResult, Language } from './port.ts';
import { createSandboxRunner, ensureImages } from './sandbox.ts';

/**
 * Seam 3, the content check: every Problem's Reference Code, in every Language, is Accepted by the
 * real Sandbox against its own Tests and the earlier Core Problems' Tests. Loading the catalogue
 * validates the content folder first. Point it at real content with CONTENT_DIR; it defaults to the
 * fixture. The pure rules the Learning core uses (`submitPlan`, `judge`) pick the Tests and the
 * Verdict, so nothing is re-implemented here.
 *
 * The cases run concurrently, at most `maxConcurrency` at once (vitest.sandbox.config.ts): a later
 * Problem submits many Tests, so one after another the check outgrows the CI job's timeout as
 * Topics are added. Every case's message names its Problem and Language, whatever order they finish.
 * A Problem that submits more than `heavyTests` Tests runs alone, after the rest: its hidden batch
 * comes within a few seconds of the container's time limit (`containerTimeoutMs`, a Test costs
 * about 0.2 s in TypeScript), so sibling containers competing for the runner's CPUs would tip it
 * into Time Limit Exceeded.
 */

const contentDir = resolve(process.env.CONTENT_DIR ?? 'src/lib/server/content/fixture');
const catalogue = await loadCatalogue(contentDir);
const engine = createEngine(process.env.DOCKER_SOCKET ?? '/var/run/docker.sock');
const runner = createSandboxRunner(engine, 'content-check');

const problems = catalogue
	.topicMap()
	.flatMap(({ id }) => catalogue.topic(id)?.chapters ?? [])
	.flatMap((chapter) => chapter.problems);
/** Most Tests a Problem may submit and still share the runner with other cases. */
const heavyTests = 30;
const testCount = (problemId: string): number => {
	const plan = submitPlan(catalogue, problemId);
	return plan.visible.length + plan.hidden.length;
};
const languages = Object.keys(sandboxConfig.images) as Language[];

describe('content check: Reference Code is Accepted', { timeout: 300_000 }, () => {
	beforeAll(() => ensureImages(engine, sandboxConfig.images), 300_000);

	it('has Problems to check', () => {
		expect(problems.length).toBeGreaterThan(0);
	});

	const ids = problems.map(({ id }) => id);
	const light = ids.filter((id) => testCount(id) <= heavyTests);
	const heavy = ids.filter((id) => testCount(id) > heavyTests);
	// vitest fails a suite with no case in it, and the fixture has no heavy Problem.
	if (light.length > 0) describe.concurrent('shared', () => cases(light));
	if (heavy.length > 0) describe('alone', () => cases(heavy));
});

function cases(ids: string[]) {
	for (const problemId of ids) {
		for (const language of languages) {
			it(`${problemId} / ${language}`, async () => {
				const files = catalogue.problem(problemId)?.referenceCode[language];
				expect(files, `${problemId}: no ${language} Reference Code`).toBeDefined();
				const plan = submitPlan(catalogue, problemId);
				// Same shape as a Submission: Example Tests in one container, the rest in another.
				const batches: { tests: typeof plan.visible; result: ExecuteResult }[] = [];
				for (const tests of [plan.visible, plan.hidden]) {
					if (tests.length === 0) continue;
					const result = await runner.execute({
						language,
						files: { ...files },
						tests: tests.map(({ id, input }) => ({ id, input })),
						limits: { timeoutMs: sandboxConfig.testTimeoutMs, memoryMb: sandboxConfig.memoryMb }
					});
					batches.push({ tests, result });
					if (result.compileError !== undefined) break;
				}
				const { verdict, failure } = judge(
					batches,
					problemId,
					(id) => catalogue.problem(id)?.title ?? id
				);
				expect(
					verdict,
					`Reference Code for ${problemId} (${language}) got ${verdict}: ${JSON.stringify(failure)}`
				).toBe('Accepted');
			});
		}
	}
}
