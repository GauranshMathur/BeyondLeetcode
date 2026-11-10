import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type Catalogue, loadCatalogue, type MainLinePlace } from '../content/catalogue.ts';
import type { ExecuteRequest, ExecuteResult, RunnerPort, TestResult } from '../runner/port.ts';
import { judgeSubmission } from './submission.ts';

/**
 * Judging a Submission at the module's interface: a Problem, a Build and a scripted Runner in,
 * a Verdict, the failure shown and the failing Problem out (or an error). The Runner records
 * each call, so the batch order shows in what it was sent.
 */

const fixtureDir = fileURLToPath(new URL('../content/fixture', import.meta.url));
// Top-level await: the it.each tables below read the catalogue while they are collected.
const catalogue = await loadCatalogue(fixtureDir);

type Script = (request: ExecuteRequest, call: number) => Partial<ExecuteResult> | Error;
type Raw = Partial<TestResult>;

/** A Runner that answers every Test `ok` with the output `ok\n`, except where `raw` says otherwise. */
function scriptedRunner(
	raw: Record<string, Raw> = {},
	script?: Script
): { runner: RunnerPort; calls: ExecuteRequest[] } {
	const calls: ExecuteRequest[] = [];
	const runner: RunnerPort = {
		execute: async (request) => {
			calls.push(request);
			const scripted = script?.(request, calls.length - 1);
			if (scripted instanceof Error) throw scripted;
			return {
				results: request.tests.map(({ id }) => ({
					id,
					status: 'ok' as const,
					stdout: 'ok\n',
					stderr: `err ${id}`,
					...raw[id]
				})),
				...scripted
			};
		}
	};
	return { runner, calls };
}

/** Problems `p` (the one submitted) and `q` (earlier), each with Example Tests `a` and hidden `b`..., all expecting `ok`. */
function stubCatalogue(hiddenOfP = ['b'], hiddenOfQ = ['z']) {
	const tests = (problemId: string, kind: 'example' | 'hidden', names: string[]) =>
		names.map((name) => ({
			id: `${problemId}/${kind}/${name}`,
			name,
			kind,
			input: `in ${problemId}/${kind}/${name}`,
			expected: 'ok\n'
		}));
	const hidden: Record<string, string[]> = { p: hiddenOfP, q: hiddenOfQ };
	return {
		mainLinePlace: (id: string): MainLinePlace | undefined =>
			id === 'p'
				? { anchor: 'p', earlier: ['q'] }
				: id === 'q'
					? { anchor: 'q', earlier: [] }
					: undefined,
		problem: (id: string) =>
			({
				id,
				title: `Title of ${id}`,
				exampleTests: tests(id, 'example', ['a'])
			}) as unknown as ReturnType<Catalogue['problem']>,
		hiddenTests: (id: string) => tests(id, 'hidden', hidden[id] ?? [])
	};
}

const submit = (
	runner: RunnerPort | undefined,
	options: {
		problemId?: string;
		hiddenBatchTests?: number;
		cat?: ReturnType<typeof stubCatalogue>;
	} = {}
) =>
	judgeSubmission({
		catalogue: options.cat ?? stubCatalogue(),
		problemId: options.problemId ?? 'p',
		language: 'python',
		files: { 'main.py': 'x' },
		runner,
		hiddenBatchTests: options.hiddenBatchTests ?? 1
	});

const idsOf = (calls: ExecuteRequest[]) => calls.map((c) => c.tests.map((t) => t.id));

describe('judgeSubmission: Verdict precedence', () => {
	// p's Submission runs: p/example/a, then q/example/a, q/hidden/z, p/hidden/b (one per batch).
	it.each([
		['every Test passes', {}, 'Accepted'],
		['a wrong answer', { 'p/hidden/b': { stdout: 'no\n' } }, 'Wrong Answer'],
		[
			'a runtime error beats a wrong answer',
			{ 'p/example/a': { stdout: 'no\n' }, 'p/hidden/b': { status: 'runtimeError' } },
			'Runtime Error'
		],
		[
			'a timeout beats a runtime error and a wrong answer',
			{
				'p/example/a': { stdout: 'no\n' },
				'q/hidden/z': { status: 'runtimeError' },
				'p/hidden/b': { status: 'timeout' }
			},
			'Time Limit Exceeded'
		]
	] as const)('across batches: %s', async (_name, raw, verdict) => {
		const { runner } = scriptedRunner(raw as Record<string, Raw>);

		expect((await submit(runner)).verdict).toBe(verdict);
	});

	it('answers a compile error in the visible batch over every other outcome, with its message', async () => {
		const { runner, calls } = scriptedRunner({}, (_request, call) =>
			call === 0 ? { compileError: 'boom', results: [] } : {}
		);

		expect(await submit(runner)).toEqual({
			verdict: 'Compile Error',
			failure: { kind: 'compile', message: 'boom' }
		});
		expect(calls).toHaveLength(1);
	});

	it('picks the first Test of the winning outcome, not the first failure', async () => {
		const { runner } = scriptedRunner({
			'p/example/a': { stdout: 'wrong' },
			'p/hidden/b': { status: 'timeout' }
		});

		expect((await submit(runner)).failure).toEqual({ kind: 'hidden', problemId: 'p' });
	});

	it('shows the first failing Test in run order', async () => {
		const { runner } = scriptedRunner({
			'p/example/a': { stdout: 'x' },
			'p/hidden/b': { stdout: 'y' }
		});

		expect(await submit(runner)).toMatchObject({
			verdict: 'Wrong Answer',
			failure: { kind: 'example', name: 'a', actual: 'x' },
			failingProblemId: 'p'
		});
	});
});

describe('judgeSubmission: how much of a failure is shown', () => {
	it.each([
		[
			'an Example Test of this Problem',
			'p/example/a',
			{
				kind: 'example',
				name: 'a',
				input: 'in p/example/a',
				expected: 'ok\n',
				actual: 'bad',
				stderr: 'err p/example/a'
			},
			'p'
		],
		['a Hidden Test of this Problem', 'p/hidden/b', { kind: 'hidden', problemId: 'p' }, 'p'],
		[
			'a Hidden Test of an earlier step',
			'q/hidden/z',
			{ kind: 'earlierStep', problemId: 'q', problemTitle: 'Title of q' },
			'q'
		],
		[
			'an Example Test of an earlier step',
			'q/example/a',
			{ kind: 'earlierStep', problemId: 'q', problemTitle: 'Title of q' },
			'q'
		]
	])(
		'shows %s as much as the Learner may see',
		async (_name, failing, failure, failingProblemId) => {
			const { runner } = scriptedRunner({ [failing]: { stdout: 'bad' } });

			expect(await submit(runner)).toEqual({
				verdict: 'Wrong Answer',
				failure,
				failingProblemId
			});
		}
	);
});

describe('judgeSubmission: the plan and the batch order', () => {
	/** The fixture's Stacks with a middle Core Problem, a copy of stacks-pop, between push and pop. */
	const withMiddle = () => {
		const pop = catalogue.problem('stacks-pop');
		if (!pop) throw new Error('fixture changed');
		const mainLine = ['stacks-push', 'stacks-mid', 'stacks-pop'];
		const place = (id: string): MainLinePlace | undefined => {
			const anchor = catalogue.problem(id)?.kind === 'extra' ? 'stacks-push' : id;
			const at = mainLine.indexOf(anchor);
			return at < 0 ? undefined : { anchor, earlier: mainLine.slice(0, at) };
		};
		return {
			mainLinePlace: place,
			problem: (id: string) =>
				id === 'stacks-mid'
					? {
							...pop,
							id,
							exampleTests: pop.exampleTests.map((t) => ({ ...t, id: `${id}/example/01` }))
						}
					: catalogue.problem(id),
			hiddenTests: (id: string) =>
				id === 'stacks-mid'
					? catalogue.hiddenTests('stacks-pop')?.map((t) => ({ ...t, id: `${id}/hidden/01` }))
					: id === 'stacks-peek'
						? [
								{
									id: 'stacks-peek/hidden/01',
									name: '01',
									kind: 'hidden' as const,
									input: 'in',
									expected: 'out'
								}
							]
						: catalogue.hiddenTests(id)
		};
	};

	it.each([
		[
			'a first Core Problem',
			'stacks-push',
			1,
			[['stacks-push/example/01'], ['stacks-push/hidden/01']]
		],
		[
			'a middle Core Problem',
			'stacks-mid',
			1,
			[
				['stacks-mid/example/01'],
				['stacks-push/example/01'],
				['stacks-push/hidden/01'],
				['stacks-mid/hidden/01']
			]
		],
		[
			'a last Core Problem, cut at 2',
			'stacks-pop',
			2,
			[
				['stacks-pop/example/01'],
				['stacks-push/example/01', 'stacks-push/hidden/01'],
				['stacks-mid/example/01', 'stacks-mid/hidden/01'],
				['stacks-pop/hidden/01']
			]
		],
		[
			'an Extra, which runs up to its parent then itself',
			'stacks-peek',
			10,
			[
				['stacks-peek/example/01'],
				['stacks-push/example/01', 'stacks-push/hidden/01', 'stacks-peek/hidden/01']
			]
		]
	])(
		'sends %s: the visible Tests first, then the hidden ones in order',
		async (_name, problemId, size, sent) => {
			const { runner, calls } = scriptedRunner();

			await judgeSubmission({
				catalogue: withMiddle() as never,
				problemId,
				language: 'python',
				files: { 'main.py': 'x' },
				runner,
				hiddenBatchTests: size
			});

			expect(idsOf(calls)).toEqual(sent);
		}
	);

	it('sends code and inputs, never an expected output, with the configured limits', async () => {
		const { runner, calls } = scriptedRunner();

		await submit(runner);

		expect(calls[0]).toEqual({
			language: 'python',
			files: { 'main.py': 'x' },
			tests: [{ id: 'p/example/a', input: 'in p/example/a' }],
			limits: { timeoutMs: 2_000, memoryMb: 256 }
		});
		expect(JSON.stringify(calls)).not.toContain('expected');
	});

	it('keeps every hidden call apart from the visible Tests', async () => {
		const { runner, calls } = scriptedRunner();

		await submit(runner);

		for (const call of calls.slice(1)) {
			expect(call.tests.some((t) => t.id === 'p/example/a')).toBe(false);
		}
	});

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
		'refuses a batch size of %s',
		async (size) => {
			const { runner, calls } = scriptedRunner();

			await expect(submit(runner, { hiddenBatchTests: size })).rejects.toThrow(RangeError);
			expect(calls).toHaveLength(0);
		}
	);

	it('answers NotFound for an unknown Problem', async () => {
		const { runner } = scriptedRunner();

		await expect(submit(runner, { problemId: 'nope' })).rejects.toMatchObject({ code: 'NotFound' });
	});
});

describe('judgeSubmission: stopping after a timeout', () => {
	it('stops after the batch holding a Time Limit Exceeded: nothing later can change the Verdict', async () => {
		const { runner, calls } = scriptedRunner({ 'q/hidden/z': { status: 'timeout' } });

		const result = await submit(runner);

		expect(result.verdict).toBe('Time Limit Exceeded');
		expect(idsOf(calls)).toEqual([['p/example/a'], ['q/example/a'], ['q/hidden/z']]);
	});

	it('stops after a timeout in the visible batch', async () => {
		const { runner, calls } = scriptedRunner({ 'p/example/a': { status: 'timeout' } });

		const result = await submit(runner);

		expect(result).toMatchObject({ verdict: 'Time Limit Exceeded', failure: { kind: 'example' } });
		expect(calls).toHaveLength(1);
	});

	it('runs every batch when a failure is not a timeout, since a later timeout would outrank it', async () => {
		const { runner, calls } = scriptedRunner({ 'q/example/a': { stdout: 'wrong' } });

		await submit(runner);

		expect(calls).toHaveLength(4);
	});

	it('ignores a timeout on an id that is not one of the batch Tests: later batches still run', async () => {
		const { runner: real, calls } = scriptedRunner();
		const runner: RunnerPort = {
			execute: async (request) => {
				const result = await real.execute(request);
				return {
					results: [...result.results, { id: 'ghost', status: 'timeout', stdout: '', stderr: '' }]
				};
			}
		};

		await submit(runner);

		expect(calls).toHaveLength(4);
	});

	it('picks the earliest Test of the winning outcome across batches', async () => {
		const { runner } = scriptedRunner({
			'q/example/a': { stdout: 'wrong' },
			'p/hidden/b': { status: 'timeout' }
		});

		const split = await submit(runner);
		const whole = await submit(
			scriptedRunner({ 'q/example/a': { stdout: 'wrong' }, 'p/hidden/b': { status: 'timeout' } })
				.runner,
			{ hiddenBatchTests: 10 }
		);

		expect(split.verdict).toBe('Time Limit Exceeded');
		expect(split).toEqual(whole);
	});
});

describe('judgeSubmission: a Runner that cannot be trusted', () => {
	it('answers RunnerUnavailable without a Runner', async () => {
		await expect(submit(undefined)).rejects.toMatchObject({ code: 'RunnerUnavailable' });
	});

	it('answers RunnerUnavailable when the Runner throws', async () => {
		const { runner } = scriptedRunner({}, () => new Error('down'));

		await expect(submit(runner)).rejects.toMatchObject({ code: 'RunnerUnavailable' });
	});

	it('answers RunnerUnavailable when a result misses a Test', async () => {
		const { runner } = scriptedRunner({}, (request) => ({
			results: request.tests
				.slice(1)
				.map(({ id }) => ({ id, status: 'ok', stdout: '', stderr: '' }))
		}));

		await expect(
			submit(runner, { hiddenBatchTests: 10, cat: stubCatalogue(['b', 'c']) })
		).rejects.toMatchObject({ code: 'RunnerUnavailable' });
	});

	it('answers RunnerUnavailable, not a Verdict, for a compile error in a hidden batch', async () => {
		const { runner } = scriptedRunner({}, (_request, call) =>
			call === 1 ? { compileError: 'secret', results: [] } : {}
		);

		await expect(submit(runner)).rejects.toMatchObject({ code: 'RunnerUnavailable' });
	});
});
