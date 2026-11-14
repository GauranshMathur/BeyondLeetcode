import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
import { LearningError } from '../learning/errors.ts';
import { judgeSubmission } from '../learning/submission.ts';
import { sandboxConfig } from './config.ts';
import { createEngine } from './engine.ts';
import type { Language } from './port.ts';
import { createSandboxRunner, ensureImages } from './sandbox.ts';

/**
 * Seam 3, the content check: every Problem's Reference Code, in every Language, is Accepted by the
 * real Sandbox against its own Tests and the earlier Core Problems' Tests. Loading the catalogue
 * validates the content folder first. Point it at real content with CONTENT_DIR; it defaults to the
 * fixture. Each case calls the Submission module (`judgeSubmission`) with the Sandbox Runner, so the
 * Tests, the batches, the request and the Verdict are the ones a Learner's Submission gets and
 * nothing is re-implemented here.
 *
 * The cases run concurrently, at most `maxConcurrency` at once (vitest.sandbox.config.ts): a later
 * Problem submits many Tests, so one after another the check outgrows the CI job's timeout as
 * Topics are added. Every case's message names its Problem and Language, whatever order they finish.
 * A Submission's hidden Tests run in containers of at most `hiddenBatchTests`, so each container
 * stays well inside its time limit (`containerTimeoutMs`) and no Problem needs to run alone.
 *
 * A case the Runner could not run at all (RunnerUnavailable: a container start that timed out on a
 * busy CI runner, say) says nothing about the content, so it is run once more and the output says
 * so. Any other outcome stands the first time, and a second RunnerUnavailable fails the case.
 */

/**
 * Runs `attempt`; if it throws RunnerUnavailable with a cause (the Runner itself threw: a container
 * start that timed out, a Docker error, the harness exiting badly), says so through `onRetry` and
 * runs it once more, whose outcome (a result or any error, RunnerUnavailable included) is final.
 * A RunnerUnavailable without a cause means the Runner answered and the answer is the problem (a
 * batch cut off by the container's clock, a hidden compile error, a missing Test): Reference Code
 * that is cut off under load is a content defect, so it fails at once like any other error, and a
 * Verdict is a result, never retried.
 */
async function withOneRetryOnRunnerUnavailable<T>(
	attempt: () => Promise<T>,
	onRetry: (cause: unknown) => void
): Promise<T> {
	try {
		return await attempt();
	} catch (error) {
		if (
			!(error instanceof LearningError) ||
			error.code !== 'RunnerUnavailable' ||
			error.cause === undefined
		)
			throw error;
		onRetry(error.cause);
		return await attempt();
	}
}

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
	beforeAll(() => ensureImages(engine, sandboxConfig.images), 300_000);

	it('has Problems to check', () => {
		expect(problems.length).toBeGreaterThan(0);
	});

	describe.concurrent('shared', () => cases(problems.map(({ id }) => id)));
});

function cases(ids: string[]) {
	for (const problemId of ids) {
		for (const language of languages) {
			it(`${problemId} / ${language}`, async () => {
				const files = catalogue.problem(problemId)?.referenceCode[language];
				expect(files, `${problemId}: no ${language} Reference Code`).toBeDefined();
				// The module a Submission goes through: its batches, its request, its Verdict.
				const { verdict, failure } = await withOneRetryOnRunnerUnavailable(
					() =>
						judgeSubmission({
							catalogue,
							problemId,
							language,
							files: { ...files },
							runner
						}),
					(cause) => {
						console.warn(
							`Runner unavailable for ${problemId} (${language}), running the case once more: ${cause}`
						);
						// A workflow annotation, so a retry shows on the run summary of a green job.
						const name = cause instanceof Error ? cause.name : typeof cause;
						console.log(
							`::warning::Content check retried ${problemId} (${language}) after RunnerUnavailable: ${name}`
						);
					}
				);
				expect(
					verdict,
					`Reference Code for ${problemId} (${language}) got ${verdict}: ${JSON.stringify(failure)}`
				).toBe('Accepted');
			});
		}
	}
}

describe('content check: the retry rule', () => {
	const unavailable = () =>
		new LearningError('RunnerUnavailable', undefined, new Error('start timed out'));

	it('runs a RunnerUnavailable case once more, says so, and returns the second result', async () => {
		let calls = 0;
		const retried: unknown[] = [];
		const result = await withOneRetryOnRunnerUnavailable(
			async () => {
				calls += 1;
				if (calls === 1) throw unavailable();
				return 'Accepted';
			},
			(cause) => retried.push(cause)
		);
		expect(result).toBe('Accepted');
		expect(calls).toBe(2);
		expect(retried).toHaveLength(1);
	});

	it('fails a case that is RunnerUnavailable twice in a row, after exactly one retry', async () => {
		let calls = 0;
		await expect(
			withOneRetryOnRunnerUnavailable(
				async () => {
					calls += 1;
					throw unavailable();
				},
				() => {}
			)
		).rejects.toMatchObject({ code: 'RunnerUnavailable' });
		expect(calls).toBe(2);
	});

	it('does not retry a RunnerUnavailable without a cause: the Runner answered, the answer is the defect', async () => {
		let calls = 0;
		await expect(
			withOneRetryOnRunnerUnavailable(
				async () => {
					calls += 1;
					throw new LearningError('RunnerUnavailable');
				},
				() => expect.unreachable('no retry expected')
			)
		).rejects.toMatchObject({ code: 'RunnerUnavailable' });
		expect(calls).toBe(1);
	});

	it('never retries a Verdict, even a wrong one, nor any other error', async () => {
		let calls = 0;
		const retried: unknown[] = [];
		const wrong = await withOneRetryOnRunnerUnavailable(
			async () => {
				calls += 1;
				return 'Wrong Answer';
			},
			(cause) => retried.push(cause)
		);
		expect(wrong).toBe('Wrong Answer');
		await expect(
			withOneRetryOnRunnerUnavailable(
				async () => {
					calls += 1;
					throw new LearningError('NotFound');
				},
				(cause) => retried.push(cause)
			)
		).rejects.toMatchObject({ code: 'NotFound' });
		await expect(
			withOneRetryOnRunnerUnavailable(
				async () => {
					calls += 1;
					throw new Error('boom');
				},
				(cause) => retried.push(cause)
			)
		).rejects.toThrow('boom');
		expect(calls).toBe(3);
		expect(retried).toEqual([]);
	});
});
