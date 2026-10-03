/**
 * Entry point of the `runner` role: `bun src/lib/server/runner/main.ts`.
 * Env: RUNNER_PORT, RUNNER_TOKEN (32+ characters), RUNNER_HOST, RUNNER_MAX_CONCURRENT, DOCKER_SOCKET.
 */
import { availableParallelism } from "node:os";
import { readRunnerEnv, sandboxConfig } from "./config";
import { createEngine } from "./engine";
import { createSandboxRunner, removeStaleContainers } from "./sandbox";
import { createRunnerHandler } from "./server";

declare const Bun: {
  serve(options: {
    port: number;
    hostname: string;
    maxRequestBodySize: number;
    fetch: (req: Request) => Promise<Response>;
  }): { port: number };
};

let env: ReturnType<typeof readRunnerEnv>;
try {
  env = readRunnerEnv(process.env, availableParallelism());
} catch (error) {
  console.error(`Runner cannot start: ${(error as Error).message}`);
  process.exit(1);
}

const engine = createEngine(env.dockerSocket);
// A Runner that died mid-run may have left containers behind.
await removeStaleContainers(engine);
const server = Bun.serve({
  port: env.port,
  hostname: env.host,
  maxRequestBodySize: sandboxConfig.requestBodyMaxBytes,
  fetch: createRunnerHandler({
    token: env.token,
    runner: createSandboxRunner(engine),
    maxConcurrent: env.maxConcurrent,
  }),
});
console.log(`Runner listening on ${env.host}:${server.port}`);
