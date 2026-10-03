import { describe, expect, it } from "vitest";
import {
  type ContractSubject,
  type ProgramKind,
  runnerContract,
} from "./contract";
import { createScriptedRunner, type RunnerScript } from "./fake";
import type { ExecuteRequest, TestInput } from "./port";

/** The scripted equivalent of each contract fixture, keyed by the Test ids the suite sends. */
function scriptFor(kind: ProgramKind): RunnerScript {
  switch (kind) {
    case "doesNotCompile":
      return { compileError: "SyntaxError" };
    case "unavailable":
      return { unavailable: true };
    case "hang":
      return { tests: { first: { status: "timeout" } } };
    case "mixed":
      return {
        tests: {
          fine: { status: "ok", stdout: "ok\n" },
          boom: { status: "runtimeError", stderr: "boom" },
          stuck: { status: "timeout" },
          "fine-again": { status: "ok", stdout: "ok again\n" },
        },
      };
    case "echo":
      return {
        tests: {
          first: { status: "ok", stdout: "1 2\n" },
          second: { status: "ok", stdout: "hello\n" },
          third: { status: "ok", stdout: "" },
        },
      };
  }
}

const scripted: ContractSubject = (kind) => ({
  runner: createScriptedRunner(scriptFor(kind)),
  language: "python",
  files: { "main.py": "" },
});

runnerContract("scripted fake", scripted);

const request = (tests: TestInput[]): ExecuteRequest => ({
  language: "go",
  files: { "main.go": "package main" },
  tests,
  limits: { timeoutMs: 1000, memoryMb: 128 },
});

describe("scripted fake runner", () => {
  it("treats an unscripted Test as ok with empty output", async () => {
    const runner = createScriptedRunner();

    const result = await runner.execute(request([{ id: "a", input: "x" }]));

    expect(result).toEqual({
      results: [{ id: "a", status: "ok", stdout: "", stderr: "" }],
    });
  });

  it("records every request it receives", async () => {
    const runner = createScriptedRunner();
    const sent = request([{ id: "a", input: "x" }]);

    await runner.execute(sent);

    expect(runner.calls).toEqual([sent]);
  });

  it("has no field for an expected output in a Test", () => {
    // @ts-expect-error expected outputs never go to the Runner
    const test: TestInput = { id: "a", input: "x", expected: "y" };

    expect(test.id).toBe("a");
  });
});
