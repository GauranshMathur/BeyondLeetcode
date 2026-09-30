import { describe, expect, it } from 'vitest';
import type { ExecuteResult, Files, Language, Limits, RunnerPort, TestInput } from './port';

/**
 * What the program under test does with each Test's input:
 * - `echo`: writes the input to stdout unchanged and exits 0
 * - `crash`: exits non-zero
 * - `hang`: never finishes
 * - `doesNotCompile`: fails to compile (or, for Python, to load)
 */
export type ProgramKind = 'echo' | 'crash' | 'hang' | 'doesNotCompile';

/** An adapter under contract, set up to run a program of the given kind on these Tests. */
export type ContractSubject = (
	kind: ProgramKind,
	tests: TestInput[]
) => { runner: RunnerPort; language: Language; files: Files };

export const contractLimits: Limits = { timeoutMs: 2000, memoryMb: 256 };

const tests: TestInput[] = [
	{ id: 'first', input: '1 2\n' },
	{ id: 'second', input: 'hello\n' },
	{ id: 'third', input: '' }
];

/** The contract every Runner port adapter must pass. Call it inside a test file. */
export function runnerContract(name: string, subject: ContractSubject): void {
	async function run(kind: ProgramKind, requestTests: TestInput[]): Promise<ExecuteResult> {
		const { runner, language, files } = subject(kind, requestTests);
		return runner.execute({ language, files, tests: requestTests, limits: contractLimits });
	}

	describe(`Runner port contract: ${name}`, () => {
		it('returns one ok result per Test, in request order, with the program output', async () => {
			const result = await run('echo', tests);

			expect(result.compileError).toBeUndefined();
			expect(result.results.map((r) => r.id)).toEqual(tests.map((t) => t.id));
			for (const [i, r] of result.results.entries()) {
				expect(r.status).toBe('ok');
				expect(r.stdout).toBe(tests[i].input);
				expect(typeof r.stderr).toBe('string');
			}
		});

		it('returns no results for no Tests', async () => {
			const result = await run('echo', []);

			expect(result).toEqual({ results: [] });
		});

		it('reports a program that exits non-zero as runtimeError for every Test', async () => {
			const result = await run('crash', tests);

			expect(result.compileError).toBeUndefined();
			expect(result.results.map((r) => [r.id, r.status])).toEqual(
				tests.map((t) => [t.id, 'runtimeError'])
			);
		});

		it('reports a program that outlives the time limit as timeout for every Test', async () => {
			const result = await run('hang', tests);

			expect(result.compileError).toBeUndefined();
			expect(result.results.map((r) => [r.id, r.status])).toEqual(
				tests.map((t) => [t.id, 'timeout'])
			);
		});

		it('reports code that does not compile as a compileError message and no results', async () => {
			const result = await run('doesNotCompile', tests);

			expect(result.compileError).toEqual(expect.any(String));
			expect(result.compileError).not.toBe('');
			expect(result.results).toEqual([]);
		});
	});
}
