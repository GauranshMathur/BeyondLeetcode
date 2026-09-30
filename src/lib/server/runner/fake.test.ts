import { describe, expect, it } from 'vitest';
import { type ContractSubject, runnerContract } from './contract';
import { createScriptedRunner, type ScriptedTest } from './fake';
import type { ExecuteRequest, TestInput } from './port';

const scripted: ContractSubject = (kind, tests) => {
	const script: Record<string, ScriptedTest> = {};
	for (const t of tests) {
		if (kind === 'echo') script[t.id] = { status: 'ok', stdout: t.input };
		if (kind === 'crash') script[t.id] = { status: 'runtimeError', stderr: 'boom' };
		if (kind === 'hang') script[t.id] = { status: 'timeout' };
	}
	const runner = createScriptedRunner(
		kind === 'doesNotCompile' ? { compileError: 'SyntaxError' } : { tests: script }
	);
	return { runner, language: 'python', files: { 'main.py': '' } };
};

runnerContract('scripted fake', scripted);

const request = (tests: TestInput[]): ExecuteRequest => ({
	language: 'go',
	files: { 'main.go': 'package main' },
	tests,
	limits: { timeoutMs: 1000, memoryMb: 128 }
});

describe('scripted fake runner', () => {
	it('treats an unscripted Test as ok with empty output', async () => {
		const runner = createScriptedRunner();

		const result = await runner.execute(request([{ id: 'a', input: 'x' }]));

		expect(result).toEqual({ results: [{ id: 'a', status: 'ok', stdout: '', stderr: '' }] });
	});

	it('records every request it receives', async () => {
		const runner = createScriptedRunner();
		const sent = request([{ id: 'a', input: 'x' }]);

		await runner.execute(sent);

		expect(runner.calls).toEqual([sent]);
	});

	it('rejects when scripted as unavailable', async () => {
		const runner = createScriptedRunner({ unavailable: true });

		await expect(runner.execute(request([]))).rejects.toThrow();
	});

	it('has no field for an expected output in a Test', () => {
		// @ts-expect-error expected outputs never go to the Runner
		const test: TestInput = { id: 'a', input: 'x', expected: 'y' };

		expect(test.id).toBe('a');
	});
});
