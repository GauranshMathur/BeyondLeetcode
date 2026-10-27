import { describe, expect, it, vi } from 'vitest';
import { containerLabel, engineCallTimeoutMs, sandboxConfig, sweepMinAgeMs } from './config';
import { type Engine, ImageMissingError, NameConflictError } from './engine';
import {
	containerSpec,
	createImageKeeper,
	createSandboxRunner,
	ensureImages,
	removeStaleContainers,
	scheduleDelayedSweep,
	secondSweepDelayMs
} from './sandbox';
import { createRunnerHandler } from './server';

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
		inspect: async () => ({ HostConfig: {} })
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
	it('starts TypeScript and Go in their own images with RUNNER_LANGUAGE set, and Python in the stock one', async () => {
		for (const [language, image] of [
			['typescript', sandboxConfig.images.typescript],
			['go', sandboxConfig.images.go],
			['python', sandboxConfig.images.python]
		] as const) {
			const { engine } = fakeEngine({ output: okLine });
			const create = vi.spyOn(engine, 'create');

			await createSandboxRunner(engine, 'test-instance').execute({
				...request,
				language
			});

			expect(create.mock.calls[0][0]).toBe(image);
			expect(create.mock.calls[0][1].Env).toContain(`RUNNER_LANGUAGE=${language}`);
		}
	});

	it('gives only Go the exec-allowed /exec tmpfs, with every other flag the same', () => {
		const host = (language: 'python' | 'typescript' | 'go') => {
			const { Tmpfs, ...rest } = containerSpec(language, 'test-instance', 1, 2000, 256).HostConfig;
			return { tmpfs: Tmpfs as Record<string, string>, rest };
		};
		const python = host('python');

		expect(host('go').tmpfs).toEqual({
			...python.tmpfs,
			'/exec': 'rw,exec,nosuid,nodev,size=64m,uid=65534,gid=65534,mode=0700'
		});
		expect(Object.keys(host('typescript').tmpfs)).toEqual(['/work']);
		expect(Object.keys(python.tmpfs)).toEqual(['/work']);
		expect(host('go').rest).toEqual(python.rest);
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
			engine.remove = vi.fn(() => new Promise<boolean>(() => {}));
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

	it('leaves a live run alone until its hard stop plus the margin, with a slow create and Created truncated', async () => {
		// Created is stamped at the second .999 and listed truncated to the second; the create call
		// answers just inside the engine call timeout, so the hard stop is as late as it can be.
		vi.useFakeTimers({ now: 1_000_000_000_999 });
		try {
			const createdMs = Date.now();
			let killedAtMs = 0;
			const removed: string[] = [];
			const { engine: base } = fakeEngine({ neverEnds: true, exitCode: 137 });
			const engine = {
				...base,
				create: () =>
					new Promise<string>((resolve) =>
						setTimeout(() => resolve('live'), engineCallTimeoutMs - 1)
					),
				kill: async () => {
					killedAtMs = Date.now();
				},
				listContainers: async () => [
					{
						id: 'live',
						created: Math.floor(createdMs / 1000),
						labels: { [containerLabel]: 'other' }
					}
				],
				remove: async (id: string) => void removed.push(id)
			} as unknown as Engine;
			const pending = createSandboxRunner(engine, 'me').execute(request);

			await vi.advanceTimersByTimeAsync(engineCallTimeoutMs - 1 + sandboxConfig.containerTimeoutMs);
			await pending;
			expect(killedAtMs).toBe(
				createdMs + engineCallTimeoutMs - 1 + sandboxConfig.containerTimeoutMs
			);
			removed.length = 0;

			// The kill time is the hard stop. Sweeping up to the margin after it must still leave the
			// run alone: dropping the Created truncation term or the margin from sweepMinAgeMs removes it.
			await removeStaleContainers(engine, 'me', killedAtMs - 1);
			await removeStaleContainers(engine, 'me', killedAtMs + 5_000);
			expect(removed).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
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

		await ensureImages(engine, { a: 'a:1', b: 'b:2' });

		expect(pulled).toEqual(['b:2']);
	});

	it('retries a failed pull with a growing pause and never gives up', async () => {
		const { engine, pulled } = imageEngine(new Set(), 3);
		const pauses: number[] = [];
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await ensureImages(engine, { a: 'a:1' }, { sleep: async (ms) => void pauses.push(ms) });

		expect(pulled).toEqual(['a:1']);
		expect(pauses).toEqual([1000, 2000, 4000]);
		vi.restoreAllMocks();
	});

	it('logs the start and finish of each pull', async () => {
		const { engine } = imageEngine(new Set());
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});

		await ensureImages(engine, { a: 'a:1' });

		expect(log.mock.calls.map(([line]) => line)).toEqual([
			'Pulling Sandbox image a:1',
			'Pulled Sandbox image a:1'
		]);
		vi.restoreAllMocks();
	});
	it('marks each Language ready on its own, so one failing pull never blocks another', async () => {
		const present = new Set(['py:1']);
		let tsPulls = 0;
		const engine = {
			hasImage: async (image: string) => present.has(image),
			pull: async (image: string) => {
				if (image === 'ts:1' && tsPulls++ < 2) throw new Error('registry down');
				present.add(image);
			}
		} as unknown as Engine;
		const ready: string[] = [];
		let releaseSleep: () => void = () => {};
		const gate = new Promise<void>((resolve) => (releaseSleep = resolve));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const done = ensureImages(
			engine,
			{ python: 'py:1', typescript: 'ts:1', go: 'go:1' },
			{ onReady: (language) => ready.push(language), sleep: () => gate }
		);
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(ready.sort()).toEqual(['go', 'python']);
		releaseSleep();
		await done;
		expect(ready.sort()).toEqual(['go', 'python', 'typescript']);
		vi.restoreAllMocks();
	});
});

describe('Sandbox runner: an image that vanished after its Language went ready', () => {
	it('fails the Run as a Runner error and reports the Language as missing', async () => {
		const engine = {
			create: async (image: string) => {
				throw new ImageMissingError(image);
			},
			pull: vi.fn()
		} as unknown as Engine;
		const missing: string[] = [];

		await expect(
			createSandboxRunner(engine, 'test-instance', {
				onImageMissing: (language) => missing.push(language)
			}).execute(request)
		).rejects.toThrow(/image .* is missing/);

		expect(missing).toEqual(['python']);
		expect(engine.pull).not.toHaveBeenCalled();
	});

	it('does not report the Language missing when create fails for another reason', async () => {
		const engine = {
			create: async () => {
				throw new Error('daemon down');
			},
			remove: async () => false
		} as unknown as Engine;
		const missing: string[] = [];
		vi.useFakeTimers();

		const pending = expect(
			createSandboxRunner(engine, 'test-instance', {
				onImageMissing: (language) => missing.push(language)
			}).execute(request)
		).rejects.toThrow(/daemon down/);
		await vi.advanceTimersByTimeAsync(5_000);
		await pending;
		vi.useRealTimers();

		expect(missing).toEqual([]);
	});

	function keeperEngine() {
		const present = new Set<string>();
		const pulls: string[] = [];
		let release: () => void = () => {};
		let gate: Promise<void> = Promise.resolve();
		const engine = {
			hasImage: async (image: string) => present.has(image),
			pull: async (image: string) => {
				pulls.push(image);
				await gate;
				present.add(image);
			}
		} as unknown as Engine;
		return {
			engine,
			present,
			pulls,
			holdPulls() {
				gate = new Promise<void>((resolve) => (release = resolve));
			},
			releasePulls: () => release()
		};
	}

	it('takes the Language out of the ready set and pulls again until it is ready once more', async () => {
		const { engine, present, pulls, holdPulls, releasePulls } = keeperEngine();
		present.add('py:1');
		const ready = new Set<string>();
		const keeper = createImageKeeper(
			engine,
			{ python: 'py:1' },
			{ onReady: (l) => ready.add(l), onLost: (l) => ready.delete(l) }
		);
		await keeper.start();
		expect([...ready]).toEqual(['python']);

		present.delete('py:1');
		holdPulls();
		keeper.missing('python');
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect([...ready]).toEqual([]);
		expect(pulls).toEqual(['py:1']);
		releasePulls();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect([...ready]).toEqual(['python']);
	});

	it('throws at once for a malformed image, before any hasImage or pull call', () => {
		const { engine, pulls } = keeperEngine();
		const hasImage = vi.spyOn(engine, 'hasImage');
		expect(() => createImageKeeper(engine, { python: 'py:1', go: 'go:' })).toThrow(/go.*go:/);
		expect(hasImage).not.toHaveBeenCalled();
		expect(pulls).toEqual([]);
	});

	it('starts one pull however many Runs find the same image missing', async () => {
		const { engine, pulls, holdPulls, releasePulls } = keeperEngine();
		const keeper = createImageKeeper(engine, { python: 'py:1', go: 'go:1' });
		holdPulls();

		keeper.missing('python');
		keeper.missing('python');
		keeper.missing('python');
		keeper.missing('go');
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(pulls.sort()).toEqual(['go:1', 'py:1']);
		releasePulls();
	});

	it('can be re-armed again after a later disappearance', async () => {
		const { engine, present, pulls } = keeperEngine();
		const keeper = createImageKeeper(engine, { python: 'py:1' });

		for (let round = 0; round < 2; round++) {
			present.delete('py:1');
			keeper.missing('python');
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		expect(pulls).toEqual(['py:1', 'py:1']);
	});

	it('behind the HTTP handler: the Run answers 500, /health stops listing the Language, then it returns', async () => {
		const { engine: pullEngine, present, holdPulls, releasePulls } = keeperEngine();
		present.add('py:1');
		const engine = {
			...pullEngine,
			hasImage: pullEngine.hasImage,
			pull: pullEngine.pull,
			create: async (image: string) => {
				if (!present.has(image)) throw new ImageMissingError(image);
				return 'c1';
			}
		} as unknown as Engine;
		const ready = new Set<string>();
		const keeper = createImageKeeper(
			engine,
			{ python: 'py:1' },
			{ onReady: (l) => ready.add(l), onLost: (l) => ready.delete(l) }
		);
		await keeper.start();
		const handle = createRunnerHandler({
			token: 't',
			runner: createSandboxRunner(engine, 'test-instance', { onImageMissing: keeper.missing }),
			maxConcurrent: 1,
			readyLanguages: () => [...ready]
		});
		const call = (path: string, init?: RequestInit) =>
			handle(
				new Request(`http://runner${path}`, {
					...init,
					headers: { Authorization: 'Bearer t' }
				})
			);
		const run = () => call('/execute', { method: 'POST', body: JSON.stringify(request) });
		vi.spyOn(console, 'error').mockImplementation(() => {});

		present.delete('py:1');
		holdPulls();
		expect((await run()).status).toBe(500);
		expect((await call('/health')).status).toBe(503);
		expect((await run()).status).toBe(503);

		releasePulls();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect((await call('/health')).status).toBe(200);
		vi.restoreAllMocks();
	});

	it('ignores a Language it has no image for, including keys every object inherits', () => {
		const { engine, pulls } = keeperEngine();
		const onLost = vi.fn();
		const keeper = createImageKeeper(engine, { python: 'py:1' }, { onLost });
		keeper.missing('constructor');
		keeper.missing('toString');
		keeper.missing('__proto__');
		expect(pulls).toEqual([]);
		expect(onLost).not.toHaveBeenCalled();
	});

	it('ignores a Language it has no image for', () => {
		const { engine, pulls } = keeperEngine();
		createImageKeeper(engine, { python: 'py:1' }).missing('cobol');
		expect(pulls).toEqual([]);
	});
});

describe('Sandbox runner: a create that fails or times out', () => {
	/** A daemon that holds containers by name, and an Engine whose create can time out on our side. */
	function daemon(createError: Error | null, lateStatus = 201) {
		const containers = new Map<string, string>();
		const removeCalls: string[] = [];
		const engine = {
			create: async (_image: string, _spec: unknown, name?: string) => {
				// The daemon completes the create (name -> container) whatever our side saw.
				if (lateStatus === 201 && name) containers.set(name, 'late-id');
				if (createError) throw createError;
				return 'c1';
			},
			remove: async (idOrName: string) => {
				removeCalls.push(idOrName);
				return containers.delete(idOrName);
			}
		} as unknown as Engine;
		return { engine, containers, removeCalls };
	}

	it('removes the container the daemon made after our create call timed out', async () => {
		const { engine, containers } = daemon(new Error('Docker POST /containers/create timed out'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(createSandboxRunner(engine, 'inst-1').execute(request)).rejects.toThrow(
			/timed out/
		);

		expect([...containers.keys()]).toEqual([]);
		vi.restoreAllMocks();
	});

	it('names the container bl-<instanceId>-<random> and removes only that name', async () => {
		const names: string[] = [];
		const removed: string[] = [];
		const engine = {
			create: async (_i: string, _s: unknown, name?: string) => {
				names.push(name ?? '');
				throw new Error('timed out');
			},
			remove: async (id: string) => void removed.push(id)
		} as unknown as Engine;

		await expect(createSandboxRunner(engine, 'inst-1').execute(request)).rejects.toThrow();
		await expect(createSandboxRunner(engine, 'inst-1').execute(request)).rejects.toThrow();

		expect(names[0]).toMatch(/^bl-inst-1-[0-9a-f]{16}$/);
		expect(names[0]).not.toBe(names[1]);
		expect(removed).toEqual(names);
	});

	it('gives up after a few tries when the daemon made nothing, keeping the create error', async () => {
		const { engine, removeCalls } = daemon(new Error('timed out'), 0);
		vi.useFakeTimers();

		const pending = expect(createSandboxRunner(engine, 'inst-1').execute(request)).rejects.toThrow(
			/timed out/
		);
		await vi.advanceTimersByTimeAsync(5_000);
		await pending;

		expect(removeCalls).toHaveLength(7);
		expect(new Set(removeCalls).size).toBe(1);
		// A last try is made later, in the background, for a daemon still stuck in the create.
		await vi.advanceTimersByTimeAsync(30_000);
		expect(removeCalls).toHaveLength(8);
		expect(new Set(removeCalls).size).toBe(1);
		vi.useRealTimers();
	});

	it('retries a remove that 404s because the daemon is still finishing the create', async () => {
		const containers = new Set<string>();
		let createdName = '';
		const engine = {
			create: async (_i: string, _s: unknown, name?: string) => {
				createdName = name ?? '';
				// The daemon registers the container 120 ms after our call timed out.
				setTimeout(() => containers.add(createdName), 120);
				throw new Error('Docker POST /containers/create timed out');
			},
			remove: async (name: string) => containers.delete(name)
		} as unknown as Engine;
		vi.useFakeTimers();

		const pending = expect(createSandboxRunner(engine, 'inst-1').execute(request)).rejects.toThrow(
			/timed out/
		);
		await vi.advanceTimersByTimeAsync(1_000);
		await pending;

		expect(containers.size).toBe(0);
		vi.useRealTimers();
	});

	it('keeps the create error and stops after one try when the remove fails', async () => {
		const remove = vi.fn(async () => {
			throw new Error('daemon down');
		});
		const engine = {
			create: async () => {
				throw new Error('create timed out');
			},
			remove
		} as unknown as Engine;
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.useFakeTimers();

		const pending = expect(createSandboxRunner(engine, 'inst-1').execute(request)).rejects.toThrow(
			/create timed out/
		);
		await vi.advanceTimersByTimeAsync(5_000);
		await pending;

		expect(remove).toHaveBeenCalledTimes(1);
		// The background try still comes later.
		await vi.advanceTimersByTimeAsync(30_000);
		expect(remove).toHaveBeenCalledTimes(2);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('holds the Run for one try, not seven, when the daemon never answers the remove', async () => {
		const remove = vi.fn(() => new Promise<boolean>(() => {}));
		const engine = {
			create: async () => {
				throw new Error('create timed out');
			},
			remove
		} as unknown as Engine;
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.useFakeTimers();
		const started = Date.now();

		let settledAt = 0;
		const pending = createSandboxRunner(engine, 'inst-1')
			.execute(request)
			.catch(() => {
				settledAt = Date.now() - started;
			});
		await vi.advanceTimersByTimeAsync(40_000);
		await pending;

		expect(settledAt).toBeGreaterThanOrEqual(4_000);
		expect(settledAt).toBeLessThan(5_000);
		expect(remove).toHaveBeenCalledTimes(2);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('leaves a name clash (409) alone: that container is not ours', async () => {
		const { engine, removeCalls } = daemon(new NameConflictError('bl-x'), 0);

		await expect(createSandboxRunner(engine, 'inst-1').execute(request)).rejects.toThrow(/409/);

		expect(removeCalls).toEqual([]);
	});

	it('removes nothing when the image is missing: a 404 made no container', async () => {
		const remove = vi.fn();
		const engine = {
			create: async (image: string) => {
				throw new ImageMissingError(image);
			},
			remove
		} as unknown as Engine;

		await expect(createSandboxRunner(engine, 'inst-1').execute(request)).rejects.toThrow(/missing/);

		expect(remove).not.toHaveBeenCalled();
	});
});

describe('Sandbox runner: bounds on the create-failure cleanup', () => {
	it('stops retrying 404s after one overall deadline of about 8 s', async () => {
		// Every remove takes 4 s and finds nothing: each try is within its cap, so only the overall
		// deadline ends the loop.
		const engine = {
			create: async () => {
				throw new Error('create timed out');
			},
			remove: vi.fn(
				() => new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3_900))
			)
		} as unknown as Engine;
		vi.useFakeTimers();
		const started = Date.now();
		let settledAt = 0;

		const pending = createSandboxRunner(engine, 'inst-1')
			.execute(request)
			.catch(() => {
				settledAt = Date.now() - started;
			});
		await vi.advanceTimersByTimeAsync(60_000);
		await pending;

		expect(settledAt).toBeGreaterThanOrEqual(7_900);
		expect(settledAt).toBeLessThanOrEqual(8_200);
		// Three tries in the Run (the last one cut short by the deadline), one background try.
		expect(engine.remove).toHaveBeenCalledTimes(4);
		vi.useRealTimers();
	});

	it('keeps at most 64 late removes waiting at once', async () => {
		const engine = {
			create: async () => {
				throw new Error('daemon down');
			},
			remove: vi.fn(async () => {
				throw new Error('daemon down');
			})
		} as unknown as Engine;
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.useFakeTimers();

		const runs = Array.from({ length: 100 }, () =>
			createSandboxRunner(engine, 'inst-1')
				.execute(request)
				.catch(() => {})
		);
		await vi.advanceTimersByTimeAsync(1_000);
		await Promise.all(runs);
		// 100 tries inside the Runs, and no late try yet.
		expect(engine.remove).toHaveBeenCalledTimes(100);
		await vi.advanceTimersByTimeAsync(31_000);
		expect(engine.remove).toHaveBeenCalledTimes(164);

		// The slots are free again once the late removes have run.
		const again = createSandboxRunner(engine, 'inst-1')
			.execute(request)
			.catch(() => {});
		await vi.advanceTimersByTimeAsync(31_000);
		await again;
		expect(engine.remove).toHaveBeenCalledTimes(166);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
});

describe('Sandbox runner: cleanup pauses and late-remove slots', () => {
	it('never lets a pause carry the cleanup past the overall 8 s deadline', async () => {
		const engine = {
			create: async () => {
				throw new Error('create timed out');
			},
			remove: vi.fn(() => new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 900)))
		} as unknown as Engine;
		vi.useFakeTimers();
		const started = Date.now();
		let settledAt = 0;

		const pending = createSandboxRunner(engine, 'inst-1')
			.execute(request)
			.catch(() => {
				settledAt = Date.now() - started;
			});
		await vi.advanceTimersByTimeAsync(60_000);
		await pending;

		expect(settledAt).toBeLessThanOrEqual(8_000);
		vi.useRealTimers();
	});

	it('counts a late remove against the cap until it has settled', async () => {
		const engine = {
			create: async () => {
				throw new Error('daemon down');
			},
			// Fails the first try fast; the late try then hangs.
			remove: vi.fn(() => new Promise<boolean>(() => {}))
		} as unknown as Engine;
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.useFakeTimers();
		const run = () =>
			createSandboxRunner(engine, 'inst-1')
				.execute(request)
				.catch(() => {});

		const first = Array.from({ length: 64 }, run);
		await vi.advanceTimersByTimeAsync(5_000);
		await Promise.all(first);
		await vi.advanceTimersByTimeAsync(31_000);
		const afterFirst = (engine.remove as ReturnType<typeof vi.fn>).mock.calls.length;
		// 64 late removes are in flight (hanging, still counted); 64 more Runs make only their own try, no late one.
		const second = Array.from({ length: 64 }, run);
		await vi.advanceTimersByTimeAsync(5_000);
		await Promise.all(second);
		await vi.advanceTimersByTimeAsync(31_000);
		expect((engine.remove as ReturnType<typeof vi.fn>).mock.calls.length - afterFirst).toBe(64);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
});

describe('Sandbox runner: a pull the daemon answers 200 but did not complete', () => {
	it('is not ready until a second look finds the image, then the keeper retries', async () => {
		let looks = 0;
		const pulls: string[] = [];
		const engine = {
			hasImage: async () => looks++ >= 3,
			pull: async (image: string) => void pulls.push(image)
		} as unknown as Engine;
		const ready: string[] = [];
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await createImageKeeper(
			engine,
			{ python: 'py:1' },
			{ onReady: (l) => ready.push(l), sleep: async () => {} }
		).start();

		// look 1 (missing), pull, look 2 (still missing) -> retry; look 3 (missing), pull, look 4 (there).
		expect(pulls).toHaveLength(2);
		expect(ready).toEqual(['python']);
		vi.restoreAllMocks();
	});
});

describe('Sandbox runner: delayed second sweep', () => {
	const startMs = 1_000_000_000_000;
	const created = (atMs: number) => atMs / 1000;

	it('removes a young foreign container the start-up sweep skipped, never an own one', async () => {
		let clock = startMs;
		const listed: Listed[] = [
			{ id: 'young', created: created(startMs - 1000), labels: { [containerLabel]: 'other' } },
			{ id: 'mine', created: created(startMs - 1000), labels: { [containerLabel]: 'me' } }
		];
		const removed: string[] = [];
		const engine = {
			listContainers: async () => listed,
			remove: async (id: string) => void removed.push(id)
		} as unknown as Engine;
		const waits: number[] = [];

		await removeStaleContainers(engine, 'me', clock);
		expect(removed).toEqual([]);

		await scheduleDelayedSweep(engine, 'me', {
			sleep: async (ms) => {
				waits.push(ms);
				clock += ms;
			},
			now: () => clock
		});

		expect(waits).toEqual([secondSweepDelayMs]);
		expect(secondSweepDelayMs).toBeGreaterThan(sweepMinAgeMs);
		expect(removed).toEqual(['young']);
	});

	it('leaves a foreign container that is still young at the second sweep', async () => {
		let clock = startMs;
		const removed: string[] = [];
		const engine = {
			listContainers: async () => [
				{
					id: 'newcomer',
					created: created(startMs + secondSweepDelayMs - 1000),
					labels: { [containerLabel]: 'other-live' }
				}
			],
			remove: async (id: string) => void removed.push(id)
		} as unknown as Engine;

		await scheduleDelayedSweep(engine, 'me', {
			sleep: async (ms) => {
				clock += ms;
			},
			now: () => clock
		});

		expect(removed).toEqual([]);
	});
});
