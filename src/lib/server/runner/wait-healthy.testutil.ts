import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { containerLabel, sandboxConfig } from './config';
import type { createEngine } from './engine';

/** Test-only helpers shared by the sandbox tests: start a Runner process, wait for it to answer `/health` 200, and tell its containers from another Runner's. */

/** A cold CI machine pulls the Sandbox image before the Runner reports ready. */
export const healthBudgetMs = 60_000;

/** Polls until 200 listing every one of `languages` (default: all) and returns every status seen on the way (503 while the image pulls). */
export async function waitUntilHealthy(
	url: string,
	token: string,
	{
		intervalMs = 100,
		languages = Object.keys(sandboxConfig.images)
	}: { intervalMs?: number; languages?: string[] } = {}
): Promise<number[]> {
	const seen: number[] = [];
	const deadline = Date.now() + healthBudgetMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } });
			seen.push(res.status);
			if (res.status === 200) {
				const body = (await res.json()) as { languages?: string[] };
				if (languages.every((language) => body.languages?.includes(language))) return seen;
			}
		} catch {
			// not listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw new Error(`Runner process did not become healthy within ${healthBudgetMs / 1000} s`);
}

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as { port: number };
			server.close(() => resolve(port));
		});
		server.on('error', reject);
	});
}

/**
 * Starts the Runner process on a free port and reads its instance id from the `Runner <id> listening on` line it logs at start-up.
 * Its output is forwarded to this process's stdout. Does not wait for `/health`.
 */
export async function startRunnerProcess(
	token: string,
	socket: string
): Promise<{ process: ChildProcess; url: string; instanceId: string }> {
	const port = await freePort();
	const child = spawn('bun', ['src/lib/server/runner/main.ts'], {
		env: { ...process.env, RUNNER_PORT: String(port), RUNNER_TOKEN: token, DOCKER_SOCKET: socket },
		stdio: ['inherit', 'pipe', 'inherit']
	});
	const stdout = child.stdout;
	if (!stdout) throw new Error('Runner process has no stdout');
	const instanceId = await new Promise<string>((resolve, reject) => {
		let seen = '';
		const fail = (reason: string) => {
			child.kill();
			reject(new Error(`${reason}; saw: ${seen}`));
		};
		const timer = setTimeout(() => fail('Runner did not log its instance id in 30 s'), 30_000);
		child.once('exit', (code) => {
			clearTimeout(timer);
			fail(`Runner exited with status ${code} before logging its instance id`);
		});
		stdout.on('data', (chunk: Buffer) => {
			process.stdout.write(chunk);
			seen += chunk.toString();
			const id = /Runner ([0-9a-f]+) listening on/.exec(seen)?.[1];
			if (id) {
				clearTimeout(timer);
				resolve(id);
			}
		});
	});
	return { process: child, url: `http://127.0.0.1:${port}`, instanceId };
}

/** Ids of the containers labelled with `instanceId` as their owner, ignoring any other Runner's on the same Docker. */
export async function containersOwnedBy(
	engine: ReturnType<typeof createEngine>,
	instanceId: string
): Promise<string[]> {
	return (await engine.listContainers(containerLabel))
		.filter(({ labels }) => labels[containerLabel] === instanceId)
		.map(({ id }) => id);
}
