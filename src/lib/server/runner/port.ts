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

import { z } from 'zod';
import { LANGUAGE_IDS, type Language } from '../../languages';

export type { Language };

/** A Build's files, keyed by path relative to the Build root. */
export type Files = Record<string, string>;

/** Longest Build path, in UTF-8 bytes: paths land under `build/` in a ustar archive. */
export const MAX_PATH_BYTES = 94;

/** Most files one Build may hold. The Runner's `sandboxConfig.maxFiles` is tested to match. */
export const MAX_BUILD_FILES = 64;

/**
 * The one rule for a Build's file paths, shared by the Learning core (before it saves a Build), the
 * scripted Runner and the Runner's request schema, so they cannot drift apart. Returns why the
 * paths are refused, or undefined when they are fine. Paths are relative and `/`-separated, with no
 * `..`, `.`, empty part, backslash or NUL; at most MAX_PATH_BYTES bytes each and MAX_BUILD_FILES
 * files; and no file lies under another file's path (`a` and `a/b` cannot both be extracted).
 */
export function buildPathsIssue(paths: readonly string[]): string | undefined {
	if (paths.length > MAX_BUILD_FILES) return 'Too many files';
	const encoder = new TextEncoder();
	const all = new Set(paths);
	for (const path of paths) {
		if (
			path === '' ||
			!path.isWellFormed() ||
			encoder.encode(path).length > MAX_PATH_BYTES ||
			path.startsWith('/') ||
			path.includes('\\') ||
			path.includes('\0') ||
			path.split('/').some((part) => part === '..' || part === '' || part === '.')
		) {
			return 'Invalid file path';
		}
		for (let slash = path.indexOf('/'); slash >= 0; slash = path.indexOf('/', slash + 1)) {
			if (all.has(path.slice(0, slash))) return 'A file path is a directory of another';
		}
	}
	return undefined;
}

/**
 * The request and result shapes, written once. They carry no Runner limit: the Runner's HTTP
 * surface adds its own on top (server.ts: most Tests, least memory, the Build path rule). Unknown
 * keys are stripped when a request is parsed, so an expected output can never reach a container.
 */

/** One Test as the Runner sees it: an id and the input, nothing else. */
const testInputSchema = z.object({ id: z.string(), input: z.string() });
export type TestInput = z.infer<typeof testInputSchema>;

/**
 * Per-run limits (ADR 0002): wall-clock timeout per Test, counted from the Test's start (not
 * container start-up or compilation), and a memory cap. CPU and pids limits are fixed by the
 * Runner, not sent per request.
 */
const limitsSchema = z.object({
	timeoutMs: z.number().int().positive(),
	memoryMb: z.number().int()
});
export type Limits = z.infer<typeof limitsSchema>;

export const executeRequestSchema = z.object({
	language: z.enum(LANGUAGE_IDS),
	files: z.record(z.string(), z.string()),
	tests: z.array(testInputSchema),
	limits: limitsSchema
});
export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

/** How one Test ended; the harness's result line uses the same set. */
export const testStatusSchema = z.enum(['ok', 'runtimeError', 'timeout']);

const testResultSchema = z.object({
	id: z.string(),
	status: testStatusSchema,
	stdout: z.string(),
	stderr: z.string()
});
export type TestStatus = TestResult['status'];
export type TestResult = z.infer<typeof testResultSchema>;

/**
 * `compileError` set: the code did not compile and `results` is empty.
 * Otherwise `results` holds one entry per request Test, in request order.
 */
export const executeResultSchema = z.object({
	compileError: z.string().optional(),
	results: z.array(testResultSchema)
});
export type ExecuteResult = z.infer<typeof executeResultSchema>;

export interface RunnerPort {
	execute(request: ExecuteRequest): Promise<ExecuteResult>;
}
