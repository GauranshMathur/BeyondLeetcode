import type { ExecuteRequest, RunnerPort, TestStatus } from './port';

export type ScriptedTest = { status: TestStatus; stdout?: string; stderr?: string };

export type RunnerScript = {
	compileError?: string;
	tests?: Record<string, ScriptedTest>;
	unavailable?: boolean;
};

export type ScriptedRunner = RunnerPort & { calls: ExecuteRequest[] };

export function createScriptedRunner(_script: RunnerScript = {}): ScriptedRunner {
	throw new Error('not implemented');
}
