/**
 * Entry point of the `runner` role: `bun src/lib/server/runner/main.ts`.
 * Env: RUNNER_PORT, RUNNER_TOKEN (32+ characters), RUNNER_HOST, RUNNER_MAX_CONCURRENT, DOCKER_SOCKET.
 */
import { randomBytes } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { readRunnerEnv, sandboxConfig } from './config';
import { createEngine } from './engine';
import {
	createSandboxRunner,
	ensureImages,
	removeStaleContainers,
	scheduleDelayedSweep
} from './sandbox';
import { createRunnerHandler } from './server';

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
const instanceId = randomBytes(8).toString('hex');
const readyLanguages: string[] = [];
const server = Bun.serve({
	port: env.port,
	hostname: env.host,
	maxRequestBodySize: sandboxConfig.requestBodyMaxBytes,
	fetch: createRunnerHandler({
		token: env.token,
		runner: createSandboxRunner(engine, instanceId),
		maxConcurrent: env.maxConcurrent,
		readyLanguages: () => readyLanguages
	})
});
console.log(
	`Runner ${instanceId} listening on ${env.host}:${server.port}, ready once an image is pulled`
);

// A Runner that died mid-run may have left containers behind; a live one's are left alone.
await removeStaleContainers(engine, instanceId);
// Containers it skipped as too young are checked once more after the grace period.
void scheduleDelayedSweep(engine, instanceId);
await ensureImages(engine, sandboxConfig.images, {
	onReady: (language) => {
		readyLanguages.push(language);
		console.log(`Runner ready for ${language}`);
	}
});
