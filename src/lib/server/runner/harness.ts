import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { sandboxConfig } from './config';
import type { ExecuteResult, Language, TestResult } from './port';
import { testStatusSchema } from './port';
import { createTar } from './tar';

/**
 * The fixed script that runs inside the Sandbox container (`python -I -c`: isolated, so nothing
 * learner-written in the working directory is ever imported into this process). It reads `<length>\n` and then
 * that many bytes of tar from stdin (the socket is never half-closed: Bun's net does not support it),
 * extracts it into the tmpfs work dir, checks the Build (py_compile; for TypeScript tsc, which emits JavaScript to /work/out, each Test then
 * running it with `node --enable-source-maps`; or go build, which also produces the binary, for Go), then runs each Test in its own
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

/** The harness's stderr kept for an error message, in characters. */
const stderrKeepChars = 4096;

/**
 * One JSON line the harness prints: a Compile Error, or a Test's result. Strict: a line with an
 * unknown field is refused, and the Run fails (sandbox.ts).
 */
export const harnessLine = z.union([
	z.strictObject({ compileError: z.string() }),
	z.strictObject({
		i: z.number().int(),
		status: testStatusSchema,
		stdout: z.string(),
		stderr: z.string()
	})
]);

/** How the container ended, as the Runner saw it. Output overflow outranks a hard stop. */
export type HarnessEnd =
	| { readonly kind: 'exited'; readonly code: number }
	/** The wall clock killed it (or start-up ran out of time). */
	| { readonly kind: 'hardStop' }
	| { readonly kind: 'overflow' };

/** Reads the harness's transcript: frames in, then how the container ended, an ExecuteResult out. */
export interface HarnessDecoder {
	/**
	 * Feeds one attached frame (stream 1 is stdout, 2 is stderr). Answers false once the container
	 * has printed more than the Runner allows; the caller then stops reading.
	 */
	frame(stream: 1 | 2, payload: Uint8Array): boolean;
	/** The result, or throws the Runner error: the output cannot be trusted. */
	finish(end: HarnessEnd): ExecuteResult;
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * The read side of the protocol, for one Run. One TextDecoder per stream, so a stderr frame that
 * ends mid-character cannot prefix the next stdout line. Rules, in the order `finish` applies them:
 * a non-zero exit makes the output untrusted; output past the cap fails the Run; a line that is not
 * a well-formed result, or bytes no newline ends (unless hard-stopped), fail it; so does a Test
 * index out of range or reported twice; the first compile error wins; a missing result is a
 * timeout only after a hard stop, a Runner error otherwise.
 */
export function createHarnessDecoder(tests: readonly { readonly id: string }[]): HarnessDecoder {
	const stdoutText = new TextDecoder();
	const stderrText = new TextDecoder();
	const lines: z.infer<typeof harnessLine>[] = [];
	let partial = '';
	let stderr = '';
	let received = 0;
	let overflowed = false;
	let refusedLine = false;

	return {
		frame(stream, payload) {
			if (overflowed) return false;
			received += payload.length;
			if (received > sandboxConfig.containerOutputMaxBytes) {
				overflowed = true;
				return false;
			}
			if (stream === 2) {
				stderr = (stderr + stderrText.decode(payload, { stream: true })).slice(0, stderrKeepChars);
				return true;
			}
			partial += stdoutText.decode(payload, { stream: true });
			for (let end = partial.indexOf('\n'); end >= 0; end = partial.indexOf('\n')) {
				const parsed = harnessLine.safeParse(safeJson(partial.slice(0, end)));
				partial = partial.slice(end + 1);
				// The harness prints only well-formed lines; anything else means the output cannot be trusted.
				if (parsed.success) lines.push(parsed.data);
				else refusedLine = true;
			}
			return true;
		},
		finish(end) {
			if (end.kind === 'overflow' || overflowed) {
				throw new Error('Sandbox produced more output than the Runner allows');
			}
			// The harness only exits non-zero when something went wrong inside it (or learner code
			// got to it): whatever it printed cannot be trusted.
			if (end.kind === 'exited' && end.code !== 0) {
				throw new Error(`Sandbox harness exited with status ${end.code}: ${stderr}`);
			}
			const hardStopped = end.kind === 'hardStop';
			// Every harness line ends in a newline; bytes left over after a normal end are not its.
			if (refusedLine || (!hardStopped && partial !== '')) {
				throw new Error(`Sandbox harness printed an unexpected line: ${stderr}`);
			}
			const seen = new Set<number>();
			for (const line of lines) {
				if (!('i' in line)) continue;
				if (line.i < 0 || line.i >= tests.length) {
					throw new Error(
						`Sandbox harness reported Test ${line.i}, outside the Test count of ${tests.length}`
					);
				}
				if (seen.has(line.i)) throw new Error(`Sandbox harness reported Test ${line.i} twice`);
				seen.add(line.i);
			}
			for (const line of lines) {
				if ('compileError' in line) return { compileError: line.compileError, results: [] };
			}
			const byIndex = new Map<number, Omit<TestResult, 'id'>>();
			for (const line of lines) if ('i' in line) byIndex.set(line.i, line);
			return {
				results: tests.map(({ id }, i): TestResult => {
					const found = byIndex.get(i);
					if (found) {
						return { id, status: found.status, stdout: found.stdout, stderr: found.stderr };
					}
					if (hardStopped) return { id, status: 'timeout', stdout: '', stderr: '' };
					throw new Error(`Sandbox ended without a result for Test ${id}: ${stderr}`);
				})
			};
		}
	};
}
