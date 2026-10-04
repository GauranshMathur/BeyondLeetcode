import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { judge, submitPlan } from '../learning/rules.ts';
import { sandboxConfig } from '../runner/config.ts';
import { createEngine } from '../runner/engine.ts';
import type { ExecuteResult, Language } from '../runner/port.ts';
import { createSandboxRunner, ensureImages } from '../runner/sandbox.ts';
import { loadCatalogue } from './catalogue.ts';

/**
 * Seam 3, the content check: every Problem's Reference Code, in every Language, is Accepted by the
 * real Sandbox against its own Tests and the earlier Core Problems' Tests. Loading the catalogue
 * validates the content folder first. Point it at real content with CONTENT_DIR; it defaults to the
 * fixture. The pure rules the Learning core uses (`submitPlan`, `judge`) pick the Tests and the
 * Verdict, so nothing is re-implemented here.
 */

const contentDir = resolve(process.env.CONTENT_DIR ?? 'src/lib/server/content/fixture');
const catalogue = await loadCatalogue(contentDir);
const engine = createEngine(process.env.DOCKER_SOCKET ?? '/var/run/docker.sock');
const runner = createSandboxRunner(engine, 'content-check');

const problems = catalogue
	.topicMap()
	.flatMap(({ id }) => catalogue.topic(id)?.chapters ?? [])
	.flatMap((chapter) => chapter.problems);
const languages = Object.keys(sandboxConfig.images) as Language[];

describe('content check: Reference Code is Accepted', { timeout: 300_000 }, () => {
	it('has Problems to check', () => {
		expect(problems.length).toBeGreaterThan(0);
	});

	for (const { id: problemId } of problems) {
		for (const language of languages) {
			it(`${problemId} / ${language}`, async () => {
				await ensureImages(engine, [sandboxConfig.images[language]]);
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
});
