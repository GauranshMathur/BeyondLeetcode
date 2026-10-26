import { buildPathsIssue, type ExecuteRequest, type RunnerPort, type TestStatus } from './port';

export type ScriptedTest = {
	status: TestStatus;
	stdout?: string;
	stderr?: string;
};

export type RunnerScript = {
	/** Every execute reports this compile error and no results. */
	compileError?: string;
	/** Raw result per Test id. An unscripted Test is ok with empty stdout and stderr. */
	tests?: Record<string, ScriptedTest>;
	/** Every execute rejects, as when the Runner cannot be reached. */
	unavailable?: boolean;
};

/** The fake records each request in `calls`, so tests can check what reached the Runner. */
export type ScriptedRunner = RunnerPort & { calls: ExecuteRequest[] };

/** Runner port adapter for tests: returns scripted raw results; never runs code or picks a Verdict. */
export function createScriptedRunner(script: RunnerScript = {}): ScriptedRunner {
	const calls: ExecuteRequest[] = [];
	return {
		calls,
		async execute(request) {
			calls.push(request);
			// Refuse what the real Runner's schema refuses, so a Seam-1 test cannot pass on a Build it would 400.
			const issue = buildPathsIssue(Object.keys(request.files));
			if (issue) throw new Error(`Invalid Build: ${issue}`);
			if (script.unavailable) throw new Error('Runner unavailable (scripted)');
			if (script.compileError !== undefined) {
				return { compileError: script.compileError, results: [] };
			}
			return {
				results: request.tests.map(({ id }) => {
					const scripted = script.tests?.[id];
					return {
						id,
						status: scripted?.status ?? 'ok',
						stdout: scripted?.stdout ?? '',
						stderr: scripted?.stderr ?? ''
					};
				})
			};
		}
	};
}
