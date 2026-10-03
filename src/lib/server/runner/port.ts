/**
 * Runner port: how code reaches a Sandbox (docs/module-map.md, "Runner port").
 *
 * The request carries code and Test inputs only. Expected outputs are never part of it:
 * learner code cannot read what is not in its container. The Learning core compares
 * outputs and picks the Verdict; an adapter only reports raw per-Test results.
 *
 * Outage: `execute` rejects when the Runner cannot be reached or fails to run the
 * request. The Learning core maps that rejection to `RunnerUnavailable`.
 */

export type Language = 'python' | 'typescript' | 'go';

/** A Build's files, keyed by path relative to the Build root. */
export type Files = Record<string, string>;

/** One Test as the Runner sees it: an id and the input, nothing else. */
export type TestInput = { id: string; input: string };

/**
 * Per-run limits (ADR 0002): wall-clock timeout per Test, counted from the Test's start (not
 * container start-up or compilation), and a memory cap. CPU and pids limits are fixed by the
 * Runner, not sent per request.
 */
export type Limits = { timeoutMs: number; memoryMb: number };

export type ExecuteRequest = {
	language: Language;
	files: Files;
	tests: TestInput[];
	limits: Limits;
};

export type TestStatus = 'ok' | 'runtimeError' | 'timeout';

export type TestResult = {
	id: string;
	status: TestStatus;
	stdout: string;
	stderr: string;
};

/**
 * `compileError` set: the code did not compile and `results` is empty.
 * Otherwise `results` holds one entry per request Test, in request order.
 */
export type ExecuteResult = { compileError?: string; results: TestResult[] };

export interface RunnerPort {
	execute(request: ExecuteRequest): Promise<ExecuteResult>;
}
