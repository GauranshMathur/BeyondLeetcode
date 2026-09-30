/** Entry point of the `runner` role: `bun src/lib/server/runner/main.ts`. Env: RUNNER_PORT, RUNNER_TOKEN, DOCKER_SOCKET. */
import { sandboxConfig } from './config';
import { createEngine } from './engine';
import { createSandboxRunner } from './sandbox';
import { createRunnerHandler } from './server';

declare const Bun: {
	serve(options: {
		port: number;
		maxRequestBodySize: number;
		fetch: (req: Request) => Promise<Response>;
	}): { port: number };
};

function fail(message: string): never {
	console.error(`Runner cannot start: ${message}`);
	process.exit(1);
}

const token = process.env.RUNNER_TOKEN;
if (!token) fail('RUNNER_TOKEN is not set. Every request must present it as a bearer token.');
const port = Number(process.env.RUNNER_PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
	fail('RUNNER_PORT is not set to a port number.');
}

const runner = createSandboxRunner(
	createEngine(process.env.DOCKER_SOCKET ?? '/var/run/docker.sock')
);
const server = Bun.serve({
	port,
	maxRequestBodySize: sandboxConfig.requestBodyMaxBytes,
	fetch: createRunnerHandler({ token, runner })
});
console.log(`Runner listening on port ${server.port}`);
