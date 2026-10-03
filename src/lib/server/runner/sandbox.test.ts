import { describe, expect, it, vi } from 'vitest';
import { containerLabel, sandboxConfig, sweepMinAgeMs } from './config';
import type { Engine } from './engine';
import { createSandboxRunner, ensureImages, removeStaleContainers } from './sandbox';

const request = {
	language: 'python' as const,
	files: { 'main.py': '' },
	tests: [{ id: 'a', input: '' }],
	limits: { timeoutMs: 1000, memoryMb: 128 }
};

const okLine = JSON.stringify({ i: 0, status: 'ok', stdout: 'hi', stderr: '' });

/** An Engine whose container prints `output` to stdout and then exits with `exitCode`. */
function fakeEngine(options: {
	output?: string;
	exitCode?: number;
	attach?: () => Promise<never>;
	removeFails?: boolean;
	neverEnds?: boolean;
}) {
	const calls: string[] = [];
	let end: () => void = () => {};
	const closed = new Promise<void>((resolve) => {
		end = resolve;
	});
	const engine = {
		create: async () => 'c1',
		wait: async () => ({ status: Promise.resolve(options.exitCode ?? 0) }),
		attach: options.attach
			? options.attach
			: async (_id: string, onFrame: (s: 1 | 2, p: Buffer) => void) => ({
					sendInput() {
						if (options.output) onFrame(1, Buffer.from(`${options.output}\n`));
						if (!options.neverEnds) end();
					},
					closed,
					destroy: end
				}),
		start: async () => {},
		kill: async (id: string) => void calls.push(`kill ${id}`),
		remove: vi.fn(async (id: string) => {
			calls.push(`remove ${id}`);
			if (options.removeFails) throw new Error('daemon down');
		}),
		inspect: async () => ({ HostConfig: {} }),
		listByLabel: async () => []
	} as unknown as Engine;
	return { engine, calls };
}

describe('Sandbox runner: harness exit status', () => {
	it('returns the results when the harness exits 0', async () => {
		const { engine } = fakeEngine({ output: okLine });

		const result = await createSandboxRunner(engine, 'test-instance').execute(request);

		expect(result.results).toEqual([{ id: 'a', status: 'ok', stdout: 'hi', stderr: '' }]);
	});

	it('discards the results and fails when the harness exits non-zero', async () => {
		const { engine } = fakeEngine({ output: okLine, exitCode: 1 });

		await expect(createSandboxRunner(engine, 'test-instance').execute(request)).rejects.toThrow(
			/exited with status 1/
		);
	});

	it('keeps timeouts when the exit is the Runner hard stop, not a failure', async () => {
		vi.useFakeTimers();
		try {
			const { engine, calls } = fakeEngine({ neverEnds: true, exitCode: 137 });
			const pending = createSandboxRunner(engine, 'test-instance').execute(request);

			await vi.advanceTimersByTimeAsync(sandboxConfig.containerTimeoutMs + 1);
			const result = await pending;

			expect(result.results).toEqual([{ id: 'a', status: 'timeout', stdout: '', stderr: '' }]);
			expect(calls).toContain('kill c1');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('Sandbox runner: Language', () => {
	it('starts TypeScript in its own image with RUNNER_LANGUAGE set, and Python in the stock one', async () => {
		for (const [language, image] of [
			['typescript', sandboxConfig.images.typescript],
			['python', sandboxConfig.images.python]
		] as const) {
			const { engine } = fakeEngine({ output: okLine });
			const create = vi.spyOn(engine, 'create');

			await createSandboxRunner(engine, 'test-instance').execute({ ...request, language });

			expect(create.mock.calls[0][0]).toBe(image);
			expect(create.mock.calls[0][1].Env).toContain(`RUNNER_LANGUAGE=${language}`);
		}
	});

	it('refuses a Language with no image yet', async () => {
		const { engine } = fakeEngine({});

		await expect(
			createSandboxRunner(engine, 'test-instance').execute({ ...request, language: 'go' })
		).rejects.toThrow(/not supported/);
	});
});

describe('Sandbox runner: leaks and stalls', () => {
	it('retries a failing remove three times and does not mask the original error', async () => {
		const { engine } = fakeEngine({
			output: okLine,
			exitCode: 2,
			removeFails: true
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(createSandboxRunner(engine, 'test-instance').execute(request)).rejects.toThrow(
			/exited with status 2/
		);

		expect(engine.remove).toHaveBeenCalledTimes(3);
	});

	it('gives up on cleanup after about 30 s even if the daemon never answers a remove', async () => {
		vi.useFakeTimers();
		try {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const { engine } = fakeEngine({ output: okLine });
			engine.remove = vi.fn(() => new Promise<void>(() => {}));
			const started = Date.now();
			const pending = createSandboxRunner(engine, 'test-instance').execute(request);
			const outcome = pending.then(
				() => 'done',
				() => 'failed'
			);

			await vi.advanceTimersByTimeAsync(31_000);

			expect(await outcome).toBe('done');
			expect(Date.now() - started).toBeLessThanOrEqual(31_000);
			expect(engine.remove).toHaveBeenCalledTimes(3);
		} finally {
			vi.useRealTimers();
		}
	});

	it('starts the hard stop before attach, so a stalled attach cannot hang the request', async () => {
		vi.useFakeTimers();
		try {
			let stalled: (e: Error) => void = () => {};
			const { engine, calls } = fakeEngine({
				attach: () =>
					new Promise<never>((_, reject) => {
						stalled = reject;
					})
			});
			const pending = createSandboxRunner(engine, 'test-instance').execute(request);
			const outcome = expect(pending).rejects.toThrow();

			await vi.advanceTimersByTimeAsync(sandboxConfig.containerTimeoutMs + 1);
			expect(calls).toContain('kill c1');
			stalled(new Error('Docker attach timed out'));
			await outcome;

			expect(calls).toContain('remove c1');
		} finally {
			vi.useRealTimers();
		}
	});
});

type Listed = { id: string; created: number; labels: Record<string, string> };

describe('Sandbox runner: start-up sweep', () => {
	const nowMs = 1_000_000_000_000;
	const agoS = (ms: number) => (nowMs - ms) / 1000;

	async function sweep(listed: Listed[]) {
		const removed: string[] = [];
		const engine = {
			listContainers: async () => listed,
			remove: async (id: string) => void removed.push(id)
		} as unknown as Engine;
		await removeStaleContainers(engine, 'me', nowMs);
		return removed;
	}

	it('keeps another instance’s young container and its own', async () => {
		const removed = await sweep([
			{
				id: 'young',
				created: agoS(sweepMinAgeMs - 1000),
				labels: { [containerLabel]: 'other' }
			},
			{
				id: 'mine',
				created: agoS(sweepMinAgeMs * 10),
				labels: { [containerLabel]: 'me' }
			}
		]);

		expect(removed).toEqual([]);
	});

	it('removes another instance’s container past the hard wall clock plus margin', async () => {
		const removed = await sweep([
			{
				id: 'old',
				created: agoS(sweepMinAgeMs + 1000),
				labels: { [containerLabel]: 'other' }
			}
		]);

		expect(removed).toEqual(['old']);
	});

	it('removes a container from before instance ids whatever its age', async () => {
		const removed = await sweep([
			{ id: 'legacy', created: agoS(0), labels: { [containerLabel]: 'true' } }
		]);

		expect(removed).toEqual(['legacy']);
	});
});

describe('Sandbox runner: ensureImages', () => {
	function imageEngine(present: Set<string>, failPulls = 0) {
		const pulled: string[] = [];
		let failures = failPulls;
		const engine = {
			hasImage: async (image: string) => present.has(image),
			pull: async (image: string) => {
				if (failures-- > 0) throw new Error('registry down');
				pulled.push(image);
				present.add(image);
			}
		} as unknown as Engine;
		return { engine, pulled };
	}

	it('pulls only the images the engine lacks', async () => {
		const { engine, pulled } = imageEngine(new Set(['a:1']));

		await ensureImages(engine, ['a:1', 'b:2']);

		expect(pulled).toEqual(['b:2']);
	});

	it('retries a failed pull with a growing pause and never gives up', async () => {
		const { engine, pulled } = imageEngine(new Set(), 3);
		const pauses: number[] = [];
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await ensureImages(engine, ['a:1'], async (ms) => void pauses.push(ms));

		expect(pulled).toEqual(['a:1']);
		expect(pauses).toEqual([1000, 2000, 4000]);
		vi.restoreAllMocks();
	});

	it('logs the start and finish of each pull', async () => {
		const { engine } = imageEngine(new Set());
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});

		await ensureImages(engine, ['a:1']);

		expect(log.mock.calls.map(([line]) => line)).toEqual([
			'Pulling Sandbox image a:1',
			'Pulled Sandbox image a:1'
		]);
		vi.restoreAllMocks();
	});
});
