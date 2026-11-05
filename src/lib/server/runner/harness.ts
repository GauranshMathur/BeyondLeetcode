import { readFileSync } from 'node:fs';

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
