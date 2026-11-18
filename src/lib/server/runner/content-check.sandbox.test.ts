import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
import { LearningError } from '../learning/errors.ts';
import { normaliseOutput } from '../learning/rules.ts';
import { judgeSubmission } from '../learning/submission.ts';
import { submitPlan } from '../submit-plan.ts';
import { sandboxConfig } from './config.ts';
import { createEngine } from './engine.ts';
import type { ExecuteResult, Language, RunnerPort } from './port.ts';
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

/** What a case is judged on: the Verdict, and what the failure shows. */
interface Outcome {
	readonly verdict: string;
	readonly failure?: unknown;
}

/**
 * Runs `attempt`; if it throws RunnerUnavailable with a cause (the Runner itself threw: a container
 * start that timed out, a Docker error, the harness exiting badly), says so through `onRetry` and
 * runs it once more, whose outcome (a result or any error, RunnerUnavailable included) is final.
 * A RunnerUnavailable without a cause means the Runner answered and the answer is the problem (a
 * batch cut off by the container's clock, a hidden compile error, a missing Test): Reference Code
 * that is cut off under load is a content defect, so it fails at once like any other error, and a
 * Verdict is a result, never retried.
 *
 * A whole-case retry would hide an earlier batch's wrong answer behind a lucky second attempt, so
 * when `earlierFailure` names a non-Accepted outcome the first attempt saw before the Runner
 * failed (with or without a cause), that outcome is the case's result and nothing is retried. When
 * the error has a cause, `onHiddenFailure` gets it first, so the Runner failure the earlier wrong
 * answer hides is still printed.
 */
async function withOneRetryOnRunnerUnavailable<T, E = never>(
	attempt: () => Promise<T>,
	onRetry: (cause: unknown) => void,
	earlierFailure: () => E | undefined = () => undefined,
	onHiddenFailure: (cause: unknown) => void = () => {}
): Promise<T | E> {
	try {
		return await attempt();
	} catch (error) {
		if (!(error instanceof LearningError) || error.code !== 'RunnerUnavailable') throw error;
		const earlier = earlierFailure();
		if (earlier !== undefined) {
			if (error.cause !== undefined) onHiddenFailure(error.cause);
			return earlier;
		}
		if (error.cause === undefined) throw error;
		onRetry(error.cause);
		return await attempt();
	}
}

const DETAIL_LIMIT = 100;
const UNREADABLE = 'unreadable';

/**
 * The text of a Runner failure, built without ever throwing: `<name>: <message>` for an Error,
 * `<typeof>: <value as text>` for anything else. A part that is not a string goes through
 * `String()`; a part that cannot be read or turned into text becomes UNREADABLE.
 */
function causeText(cause: unknown): string {
	const part = (read: () => unknown): string => {
		try {
			return String(read());
		} catch {
			return UNREADABLE;
		}
	};
	try {
		if (cause instanceof Error) return `${part(() => cause.name)}: ${part(() => cause.message)}`;
		return `${typeof cause}: ${part(() => cause)}`;
	} catch {
		return UNREADABLE;
	}
}

/**
 * Text that is safe inside a `::warning::` workflow command, and on any log line: one line, at most
 * DETAIL_LIMIT characters counted by code point (so no surrogate pair is split), with nothing the
 * runner would read as a command or decode. Control characters and every `#` become spaces (the legacy `##[error]` form of a command is read
 * anywhere on a line, and a removal below can join `#` and `[` into it, so none is kept); every run
 * of `::` and every `%` (the start of the `%0A`, `%0D` and `%25` escapes) are dropped. The text can quote
 * part of a Docker daemon reply; it goes only into this repo's own CI log.
 */
function annotationDetail(text: string): string {
	const clean = text
		// biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to strip them
		.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029#]/g, ' ')
		.replace(/%/g, '')
		.replace(/:{2,}/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return Array.from(clean).slice(0, DETAIL_LIMIT).join('').trim();
}

/** Every line the case prints about a Runner failure, each built from one sanitised tail. */
function runnerFailureLines(problemId: string, language: string, cause: unknown) {
	const tail = annotationDetail(causeText(cause));
	return {
		warning: `Runner unavailable for ${problemId} (${language}), running the case once more: ${tail}`,
		annotation: `::warning::Content check retried ${problemId} (${language}) after RunnerUnavailable: ${tail}`,
		hidden: `Runner also failed for ${problemId} (${language}) after an earlier batch failed, not retried: ${tail}`
	};
}

/**
 * Wraps the Runner to note the first batch whose result is not Accepted: a compile error, a Test
 * that ran into an error or its own limit, or output that differs from the Test's expected one.
 * A Test the container cut off says nothing about the Reference Code, so it is not noted. Only
 * the Test's id and the kind of failure are kept: a Hidden Test's input and output stay out of
 * the log.
 */
function watchRunner(
	runner: RunnerPort,
	expectedById: ReadonlyMap<string, string>
): { runner: RunnerPort; firstFailure: () => Outcome | undefined } {
	let first: Outcome | undefined;
	return {
		runner: {
			async execute(request) {
				const result = await runner.execute(request);
				first ??= failureOf(result, expectedById);
				return result;
			}
		},
		firstFailure: () => first
	};
}

function failureOf(
	result: ExecuteResult,
	expectedById: ReadonlyMap<string, string>
): Outcome | undefined {
	if (result.compileError !== undefined) return { verdict: 'Compile Error', failure: 'compile' };
	for (const test of result.results) {
		if (test.cutOff) continue;
		const verdict =
			test.status === 'timeout'
				? 'Time Limit Exceeded'
				: test.status === 'runtimeError'
					? 'Runtime Error'
					: normaliseOutput(test.stdout) === normaliseOutput(expectedById.get(test.id) ?? '')
						? undefined
						: 'Wrong Answer';
		if (verdict) return { verdict, failure: { test: test.id } };
	}
	return undefined;
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
				const plan = submitPlan(catalogue, problemId, sandboxConfig.hiddenBatchTests);
				const expectedById = new Map(
					[...(plan?.visible ?? []), ...(plan?.hidden.flat() ?? [])].map((t) => [t.id, t.expected])
				);
				const firstAttempt = watchRunner(runner, expectedById);
				let attempts = 0;
				// The module a Submission goes through: its batches, its request, its Verdict.
				const { verdict, failure } = await withOneRetryOnRunnerUnavailable(
					() =>
						judgeSubmission({
							catalogue,
							problemId,
							language,
							files: { ...files },
							runner: attempts++ === 0 ? firstAttempt.runner : runner
						}),
					(cause) => {
						const lines = runnerFailureLines(problemId, language, cause);
						console.warn(lines.warning);
						// A workflow annotation, so a retry shows on the run summary of a green job.
						console.log(lines.annotation);
					},
					firstAttempt.firstFailure,
					(cause) => console.warn(runnerFailureLines(problemId, language, cause).hidden)
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

	it('does not retry when an earlier batch already gave a wrong answer: the case fails with it', async () => {
		let calls = 0;
		const retried: unknown[] = [];
		const wrong = { verdict: 'Wrong Answer', failure: { test: 'hidden-3' } };
		const result = await withOneRetryOnRunnerUnavailable(
			async () => {
				calls += 1;
				throw unavailable();
			},
			(cause) => retried.push(cause),
			() => wrong
		);
		expect(result).toBe(wrong);
		expect(calls).toBe(1);
		expect(retried).toEqual([]);
	});

	it('fails with an earlier wrong answer even when the Runner failure has no cause', async () => {
		const wrong = { verdict: 'Wrong Answer', failure: { test: 'hidden-1' } };
		const result = await withOneRetryOnRunnerUnavailable(
			async () => {
				throw new LearningError('RunnerUnavailable');
			},
			() => expect.unreachable('no retry expected'),
			() => wrong
		);
		expect(result).toBe(wrong);
	});

	it('hands the Runner failure an earlier wrong answer hides to the callback, once, and retries nothing', async () => {
		let calls = 0;
		const hidden: unknown[] = [];
		const cause = new Error('start timed out');
		const wrong = { verdict: 'Wrong Answer', failure: { test: 'hidden-3' } };
		const result = await withOneRetryOnRunnerUnavailable(
			async () => {
				calls += 1;
				throw new LearningError('RunnerUnavailable', undefined, cause);
			},
			() => expect.unreachable('no retry expected'),
			() => wrong,
			(c) => hidden.push(c)
		);
		expect(result).toBe(wrong);
		expect(calls).toBe(1);
		expect(hidden).toEqual([cause]);
	});

	it('does not call the callback for an earlier wrong answer when the error has no cause', async () => {
		const result = await withOneRetryOnRunnerUnavailable(
			async () => {
				throw new LearningError('RunnerUnavailable');
			},
			() => expect.unreachable('no retry expected'),
			() => 'earlier',
			() => expect.unreachable('no cause to name')
		);
		expect(result).toBe('earlier');
	});

	it('still retries once when the first attempt saw nothing wrong before the Runner failed', async () => {
		let calls = 0;
		const result = await withOneRetryOnRunnerUnavailable(
			async () => {
				calls += 1;
				if (calls === 1) throw unavailable();
				return { verdict: 'Accepted' };
			},
			() => {},
			() => undefined
		);
		expect(result).toEqual({ verdict: 'Accepted' });
		expect(calls).toBe(2);
	});
});

describe('content check: the retry annotation detail', () => {
	it('keeps a plain message', () => {
		expect(annotationDetail('Sandbox start-up exceeded the time limit')).toBe(
			'Sandbox start-up exceeded the time limit'
		);
	});

	it('cannot start a workflow command through a line break or an escaped one', () => {
		for (const message of [
			'first\n::error::injected',
			'first\r\n::error::injected',
			'first%0A::error::injected',
			'first%0d::error::injected',
			'a%250Ab'
		]) {
			const detail = annotationDetail(message);
			expect(detail).not.toMatch(/[\r\n]/);
			expect(detail).not.toContain('::');
			expect(detail).not.toContain('%');
		}
		expect(annotationDetail('a\n::error::b')).toBe('a errorb');
	});

	it('cuts a very long message to a fixed length on one line', () => {
		const detail = annotationDetail(`${'x'.repeat(500)}\nmore`);
		expect(detail).toBe('x'.repeat(DETAIL_LIMIT));
	});

	it('gives an empty string for an empty message and reads a non-Error cause', () => {
		expect(annotationDetail('')).toBe('');
		expect(annotationDetail('plain text cause')).toBe('plain text cause');
	});

	it('removes a run of colons whole, so none can be rejoined into a pair', () => {
		expect(annotationDetail('a:::b::::c: :d')).not.toContain('::');
	});
});

describe('content check: the retry lines about a Runner failure', () => {
	const linesFor = (cause: unknown) => runnerFailureLines('p1', 'python', cause);
	const head = '::warning::Content check retried p1 (python) after RunnerUnavailable: ';
	const named = (name: string, message: unknown) =>
		Object.assign(new Error('x'), { name, message });

	it('keeps a colon at the end of a name from making a pair mid-line', () => {
		const { annotation } = linesFor(named('Foo:', 'msg'));
		expect(annotation.startsWith(head)).toBe(true);
		expect(annotation.slice(head.length)).not.toContain('::');
	});

	it.each([
		'first\n::error::injected',
		'first%0A::error::injected',
		'##[error]x',
		'##[stop-commands]tok',
		'#%#[error]x',
		'#::#[error]x',
		'###[#[error]x'
	])('prints every line on one line, with no escape and no command, for %j', (message) => {
		const { warning, annotation, hidden } = linesFor(new Error(message));
		for (const line of [warning, annotation, hidden]) {
			expect(line).not.toMatch(/[\r\n]/);
			expect(line).not.toContain('%');
			expect(line).not.toContain('##[');
			expect(line.replace(head, '')).not.toContain('::');
		}
	});

	it('never throws, whatever the cause holds', () => {
		const getterThrows = new Error('x');
		Object.defineProperty(getterThrows, 'message', {
			get() {
				throw new Error('no message');
			}
		});
		const toStringThrows = {
			toString() {
				throw new Error('no text');
			}
		};
		for (const cause of [named('Error', 42), getterThrows, toStringThrows]) {
			const { warning, annotation, hidden } = linesFor(cause);
			for (const line of [warning, annotation, hidden]) {
				expect(line.replace(head, '')).not.toContain('::');
			}
			expect(annotation.startsWith(head)).toBe(true);
		}
		expect(linesFor(named('Error', 42)).warning).toContain('Error: 42');
	});

	it('cuts by code point, so no surrogate pair is split', () => {
		const detail = annotationDetail(`${'x'.repeat(99)}\u{1F600}tail`);
		expect(detail.isWellFormed()).toBe(true);
		expect(Array.from(detail).length).toBeLessThanOrEqual(DETAIL_LIMIT);
		const tail = linesFor(new Error(`${'x'.repeat(92)}\u{1F600}tail`)).annotation.slice(
			head.length
		);
		expect(tail.isWellFormed()).toBe(true);
		expect(Array.from(tail).length).toBeLessThanOrEqual(DETAIL_LIMIT);
	});
});

describe('content check: noting the first failing batch', () => {
	const expected = new Map([
		['t1', '1'],
		['t2', '2']
	]);
	const request = { language: 'python', files: {}, tests: [], limits: {} } as never;
	const ok = (id: string, stdout: string) => ({ id, status: 'ok' as const, stdout, stderr: '' });

	it('notes a wrong answer in an earlier batch, then lets the next batch fail the Runner', async () => {
		const answers: ExecuteResult[] = [{ results: [ok('t1', '9')] }];
		const watch = watchRunner(
			{
				async execute() {
					const next = answers.shift();
					if (!next) throw new Error('daemon gone');
					return next;
				}
			},
			expected
		);
		await watch.runner.execute(request);
		await expect(watch.runner.execute(request)).rejects.toThrow('daemon gone');
		expect(watch.firstFailure()).toEqual({ verdict: 'Wrong Answer', failure: { test: 't1' } });
	});

	it('notes nothing for right answers, and ignores a Test the container cut off', async () => {
		const watch = watchRunner(
			{
				async execute() {
					return {
						results: [
							ok('t1', '1\n'),
							{
								id: 't2',
								status: 'timeout' as const,
								stdout: '',
								stderr: '',
								cutOff: true as const
							}
						]
					};
				}
			},
			expected
		);
		await watch.runner.execute(request);
		expect(watch.firstFailure()).toBeUndefined();
	});

	it('keeps the first failure when a later batch fails differently', async () => {
		const answers: ExecuteResult[] = [
			{ results: [{ id: 't1', status: 'runtimeError', stdout: '', stderr: 'boom' }] },
			{ compileError: 'nope', results: [] }
		];
		const watch = watchRunner({ execute: async () => answers.shift() as ExecuteResult }, expected);
		await watch.runner.execute(request);
		await watch.runner.execute(request);
		expect(watch.firstFailure()).toEqual({ verdict: 'Runtime Error', failure: { test: 't1' } });
	});
});
