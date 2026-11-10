import { type ChildProcess, spawn } from 'node:child_process';
import { freePort } from '../../test/free-port.ts';
import { containerLabel, sandboxConfig } from './config';
import { type ContainerEnd, runContainer } from './container';
import { type ContainerSpec, createEngine, type Engine } from './engine';
import { createHttpRunner } from './http-adapter';
import type { RunnerPort } from './port';

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
			const res = await fetch(`${url}/health`, {
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(5_000)
			});
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

/** Every Runner this module has spawned and not yet stopped, so a `beforeAll` that times out cannot orphan one. */
const spawned = new Set<ChildProcess>();

/** Kills every Runner process `startRunnerProcess` spawned. Call it in `afterAll`. */
export function stopTestRunners(): void {
	for (const child of spawned) child.kill();
	spawned.clear();
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
		env: {
			...process.env,
			RUNNER_HOST: '127.0.0.1',
			RUNNER_PORT: String(port),
			RUNNER_TOKEN: token,
			DOCKER_SOCKET: socket
		},
		stdio: ['inherit', 'pipe', 'inherit']
	});
	spawned.add(child);
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

/**
 * The one start every sandbox test file shares: starts the Runner process, waits until it is
 * healthy, then makes and removes one container from each of `images` (default: every Sandbox
 * image) to warm the engine, so the first test does not pay for it. `engine.create` never pulls.
 * `runner` is the HTTP adapter. The caller calls `stopTestRunners()` in its `afterAll`.
 */
export async function startTestRunner(
	token: string,
	{ images = Object.values(sandboxConfig.images) }: { images?: string[] } = {}
): Promise<{ process: ChildProcess; url: string; instanceId: string; runner: RunnerPort }> {
	const socket = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
	const started = await startRunnerProcess(token, socket);
	try {
		await waitUntilHealthy(started.url, token);
		const engine = createEngine(socket);
		for (const image of images) {
			await engine
				.create(image, { Labels: { [containerLabel]: started.instanceId } })
				.then((id) => engine.remove(id));
		}
	} catch (error) {
		started.process.kill();
		throw error;
	}
	return { ...started, runner: createHttpRunner({ url: started.url, token }) };
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

/**
 * Runs one container the way the Runner does (its create, wait, attach, start, stdin and removal
 * go through the container module) and returns how it ended with what it printed. `override`
 * replaces the spec's `Cmd` or `Env`. Frames are kept in order so a caller can replay them into
 * the Runner's own decoder.
 */
export async function runCaptured(
	engine: Engine,
	run: {
		image: string;
		spec: ContainerSpec;
		input: Uint8Array;
		override?: { Cmd?: string[]; Env?: string[] };
	}
): Promise<{ end: ContainerEnd; stdout: string; frames: [1 | 2, Buffer][] }> {
	const frames: [1 | 2, Buffer][] = [];
	let stdout = '';
	const end = await runContainer(engine, {
		instanceId: 'test-instance',
		...run,
		frame: (stream, payload) => {
			frames.push([stream, payload]);
			if (stream === 1) stdout += payload.toString('utf8');
			return true;
		}
	});
	return { end, stdout, frames };
}
