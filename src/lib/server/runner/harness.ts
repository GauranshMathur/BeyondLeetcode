import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { sandboxConfig } from './config';
import type { Language } from './port';
import { createTar } from './tar';

/**
 * The fixed script that runs inside the Sandbox container (`python -I -c`: isolated, so nothing
 * learner-written in the working directory is ever imported into this process). It reads `<length>\n` and then
 * that many bytes of tar from stdin (the socket is never half-closed: Bun's net does not support it),
 * extracts it into the tmpfs work dir, checks the Build (py_compile, tsc --noEmit for TypeScript, or go build, which
 * also produces the binary, for Go), then runs each Test in its own
 * process and prints one JSON line per Test to stdout. Learner code never gets the harness's
 * stdout: it runs as a child with piped stdio.
 *
 * Tar layout: `build/<path>` for the Build's files, `tests/<index>.in` for each Test input.
 * Env: RUNNER_LANGUAGE ("python", "typescript" or "go"; the one script serves every Sandbox image),
 * RUNNER_TEST_COUNT, RUNNER_TEST_TIMEOUT_MS, RUNNER_OUTPUT_CAP, RUNNER_TOTAL_OUTPUT_CAP,
 * RUNNER_DEADLINE_S.
 *
 * Tests in one container are NOT isolated from each other: the harness clears files and IPC objects
 * but cannot reset kernel counters (pids, inode numbers, IPC ids, cgroup stats), which carry a few
 * bytes. Keeping Hidden Tests from visible ones is done by running them in separate containers.
 *
 * This process is PID 1 and shares a uid with learner code, so it never chdirs into /work, reads
 * every Test input and the Build into memory and deletes /work/tests before the first learner
 * process starts, wipes /work and restores the Build from memory before every Test (nothing a Test
 * wrote survives it, IPC objects included; for Go also /exec, where the binary lives, since /work
 * is noexec: it is wiped and restored from memory the same way), and on any unexpected failure exits
 * non-zero without printing further results (the Runner then treats the run as failed).
 */
export const harnessScript = readFileSync(new URL('./harness.py', import.meta.url), 'utf8');

/** The RUNNER_* variables the harness reads, in the container's Env form. */
export function harnessEnv(language: Language, testCount: number, testTimeoutMs: number): string[] {
	return [
		`RUNNER_LANGUAGE=${language}`,
		`RUNNER_TEST_COUNT=${testCount}`,
		`RUNNER_TEST_TIMEOUT_MS=${testTimeoutMs}`,
		`RUNNER_OUTPUT_CAP=${sandboxConfig.outputCapBytes}`,
		`RUNNER_TOTAL_OUTPUT_CAP=${sandboxConfig.totalOutputCapBytes}`,
		`RUNNER_DEADLINE_S=${sandboxConfig.containerDeadlineS}`
	];
}

/** What goes to the harness's stdin: the `<length>\n` prefix, then the tar of `build/<path>` and `tests/<i>.in`. */
export function harnessInput(files: Record<string, string>, inputs: string[]): Buffer {
	const tar = createTar([
		...Object.entries(files).map(([path, content]) => ({ path: `build/${path}`, content })),
		...inputs.map((input, i) => ({ path: `tests/${i}.in`, content: input }))
	]);
	return Buffer.concat([Buffer.from(`${tar.length}\n`), tar]);
}

/** One JSON line the harness prints: a Compile Error, or a Test's result. */
export const harnessLine = z.union([
	z.object({ compileError: z.string() }),
	z.object({
		i: z.number().int(),
		status: z.enum(['ok', 'runtimeError', 'timeout']),
		stdout: z.string(),
		stderr: z.string()
	})
]);
