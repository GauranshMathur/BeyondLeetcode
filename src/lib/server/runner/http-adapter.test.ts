import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpRunner } from "./http-adapter";

let server: Server;
afterEach(() => server?.close());

async function runnerAnswering(status: number): Promise<string> {
  server = createServer((_req, res) => {
    res
      .writeHead(status, { "Content-Type": "application/json" })
      .end('{"error":"busy"}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return `http://127.0.0.1:${port}`;
}

describe("HTTP runner adapter", () => {
  it("rejects, like any other failure, when the Runner answers 503 busy", async () => {
    const runner = createHttpRunner({
      url: await runnerAnswering(503),
      token: "x",
    });

    await expect(
      runner.execute({
        language: "python",
        files: { "main.py": "" },
        tests: [],
        limits: { timeoutMs: 1000, memoryMb: 128 },
      }),
    ).rejects.toThrow(/503/);
  });
});
