import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { containerLabel, sandboxConfig, sweepMinAgeMs } from './config';
import { createEngine } from './engine';
import { createHttpRunner } from './http-adapter';
import { containerSpec, removeStaleContainers } from './sandbox';
import { waitUntilHealthy } from './wait-healthy.testutil';

/** Real Docker: what the Runner does at start-up (image pull, sweep). */

const token = 'sandbox-test-token-0123456789-abcdef';
const socket = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const engine = createEngine(socket);
const image = sandboxConfig.pythonImage;
const keeper = 'beyondleetcode-test-keep:1';
const docker = (...args: string[]) => execFileSync('docker', args, { stdio: 'pipe' });

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

describe('Runner start: image pull', { timeout: 180_000 }, () => {
	let runnerProcess: ChildProcess | undefined;
	afterEach(() => {
		runnerProcess?.kill();
		try {
			docker('rmi', keeper);
		} catch {
			// never tagged
		}
	});

	it('reports not-ready, pulls the missing image, then serves a run', async () => {
		if (!(await engine.hasImage(image))) docker('pull', image);
		// Untag instead of deleting: a second tag keeps the layers, so the pull below downloads nothing.
		docker('tag', image, keeper);
		docker('rmi', image);
		expect(await engine.hasImage(image)).toBe(false);

		const port = await freePort();
		const url = `http://127.0.0.1:${port}`;
		runnerProcess = spawn('bun', ['src/lib/server/runner/main.ts'], {
			env: {
				...process.env,
				RUNNER_PORT: String(port),
				RUNNER_TOKEN: token,
				DOCKER_SOCKET: socket
			},
			stdio: 'inherit'
		});
		const seen = await waitUntilHealthy(url, token, { intervalMs: 20 });

		expect(seen[0]).toBe(503);
		expect(seen.at(-1)).toBe(200);
		expect(await engine.hasImage(image)).toBe(true);
		const result = await createHttpRunner({ url, token }).execute({
			language: 'python',
			files: { 'main.py': 'print(input())' },
			tests: [{ id: 'a', input: 'hi' }],
			limits: { timeoutMs: 2000, memoryMb: 128 }
		});
		expect(result).toMatchObject({
			results: [{ id: 'a', status: 'ok', stdout: 'hi\n' }]
		});
	});
});

describe('Runner start: sweep', { timeout: 60_000 }, () => {
	const made: string[] = [];
	afterEach(async () => {
		for (const id of made.splice(0)) await engine.remove(id);
	});

	async function sleeper(label: string | undefined): Promise<string> {
		const spec = containerSpec('python', 'x', 1, 2000, 256);
		const labels = label === undefined ? {} : { [containerLabel]: label };
		const id = await engine.create(image, {
			...spec,
			Labels: labels,
			Cmd: ['sleep', '60']
		});
		made.push(id);
		await engine.start(id);
		return id;
	}
	const alive = async (id: string) => (await engine.listByLabel(containerLabel)).includes(id);

	it('leaves a fresh container of another instance and removes an old one', async () => {
		const other = await sleeper('another-instance');

		await removeStaleContainers(engine, 'me');
		expect(await alive(other)).toBe(true);

		await removeStaleContainers(engine, 'me', Date.now() + sweepMinAgeMs + 2000);
		expect(await alive(other)).toBe(false);
	});

	it('removes a container labelled by a version before instance ids, however fresh', async () => {
		const legacy = await sleeper('true');

		await removeStaleContainers(engine, 'me');

		expect(await alive(legacy)).toBe(false);
	});

	it('never removes its own instance’s containers', async () => {
		const mine = await sleeper('me');

		await removeStaleContainers(engine, 'me', Date.now() + 10 * sweepMinAgeMs);

		expect(await alive(mine)).toBe(true);
	});
});
