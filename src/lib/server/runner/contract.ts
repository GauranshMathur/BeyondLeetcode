import { describe, expect, it } from "vitest";
import type {
  ExecuteResult,
  Files,
  Language,
  Limits,
  RunnerPort,
  TestInput,
} from "./port";

/**
 * What the program under test does. Each kind is a fixture the subject must provide:
 * - `echo`: writes the Test input to stdout unchanged and exits 0
 * - `mixed`: like `echo`, except a Test whose input is `crash` exits non-zero and one whose
 *   input is `hang` never finishes
 * - `hang`: never finishes, for every Test
 * - `doesNotCompile`: has invalid syntax, so it fails to compile (Python: to parse)
 * - `unavailable`: the adapter cannot reach its Runner (HTTP adapter: nothing is listening)
 */
export type ProgramKind =
  "echo" | "mixed" | "hang" | "doesNotCompile" | "unavailable";

/** An adapter under contract, set up for one Language and one kind of program. */
export type ContractSubject = (kind: ProgramKind) => {
  runner: RunnerPort;
  language: Language;
  files: Files;
};

/** `timeoutMs` counts run time per Test only, not container start-up or compilation. */
export const contractLimits: Limits = { timeoutMs: 2000, memoryMb: 256 };

const echoTests: TestInput[] = [
  { id: "first", input: "1 2\n" },
  { id: "second", input: "hello\n" },
  { id: "third", input: "" },
];

const mixedTests: TestInput[] = [
  { id: "fine", input: "ok\n" },
  { id: "boom", input: "crash" },
  { id: "stuck", input: "hang" },
  { id: "fine-again", input: "ok again\n" },
];

/**
 * The contract every Runner port adapter must pass. Call it once per Language, inside a test
 * file: the subject decides which Language and fixture files each `kind` runs.
 *
 * Real adapters start containers, so the suite allows each test 60s; the 2s in
 * `contractLimits` is the per-Test limit the adapter enforces, not the test's own timeout.
 */
export function runnerContract(name: string, subject: ContractSubject): void {
  async function run(
    kind: ProgramKind,
    tests: TestInput[],
  ): Promise<ExecuteResult> {
    const { runner, language, files } = subject(kind);
    return runner.execute({ language, files, tests, limits: contractLimits });
  }

  describe(`Runner port contract: ${name}`, { timeout: 60_000 }, () => {
    it("returns one ok result per Test, in request order, with the program output", async () => {
      const result = await run("echo", echoTests);

      expect(result.compileError).toBeUndefined();
      expect(result.results.map((r) => r.id)).toEqual(
        echoTests.map((t) => t.id),
      );
      for (const [i, r] of result.results.entries()) {
        expect(r.status).toBe("ok");
        expect(r.stdout).toBe(echoTests[i].input);
        expect(typeof r.stderr).toBe("string");
      }
    });

    it("returns no results for no Tests", async () => {
      const result = await run("echo", []);

      expect(result).toEqual({ results: [] });
    });

    it("reports each Test on its own: ok, runtimeError and timeout in one request", async () => {
      const result = await run("mixed", mixedTests);

      expect(result.compileError).toBeUndefined();
      expect(result.results.map((r) => [r.id, r.status])).toEqual([
        ["fine", "ok"],
        ["boom", "runtimeError"],
        ["stuck", "timeout"],
        ["fine-again", "ok"],
      ]);
      for (const r of result.results) {
        expect(typeof r.stdout).toBe("string");
        expect(typeof r.stderr).toBe("string");
      }
      expect(result.results[0].stdout).toBe("ok\n");
      expect(result.results[3].stdout).toBe("ok again\n");
    });

    it("reports a program that outlives the time limit as timeout", async () => {
      const result = await run("hang", echoTests.slice(0, 1));

      expect(result.compileError).toBeUndefined();
      expect(result.results.map((r) => [r.id, r.status])).toEqual([
        ["first", "timeout"],
      ]);
    });

    it("reports code that does not compile as a compileError message and no results", async () => {
      const result = await run("doesNotCompile", echoTests);

      expect(result.compileError).toEqual(expect.any(String));
      expect(result.compileError).not.toBe("");
      expect(result.results).toEqual([]);
    });

    it("rejects, rather than returning a result, when the Runner cannot be reached", async () => {
      await expect(run("unavailable", echoTests)).rejects.toThrow();
    });
  });
}
