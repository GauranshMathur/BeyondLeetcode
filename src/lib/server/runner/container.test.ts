import { describe, expect, it, vi } from 'vitest';
import { sandboxConfig } from './config';
import { runContainer } from './container';
import { deadline } from './deadline';
import { type Engine, ImageMissingError, NameConflictError } from './engine';

/** Runs a container with an empty spec; a test overrides only what it is about. */
const run = (engine: Engine, extra: Partial<Parameters<typeof runContainer>[1]> = {}) =>
	runContainer(engine, {
		instanceId: 'inst-1',
		image: 'img:1',
		spec: {},
		input: new Uint8Array(),
		frame: () => true,
		...extra
	});

/** An Engine whose container prints `output` to stdout and then exits with `exitCode`. */
function fakeEngine(options: {
	output?: string;
	exitCode?: number;
	attach?: () => Promise<never>;
	removeFails?: boolean;
	killFails?: boolean;
	neverEnds?: boolean;
	exitNever?: boolean;
	/** How long the daemon takes to answer the wait request. */
	waitMs?: number;
}) {
	const calls: string[] = [];
	let end: () => void = () => {};
	const closed = new Promise<void>((resolve) => {
		end = resolve;
	});
	const engine = {
		create: async () => 'c1',
		wait: async (id: string) => {
			calls.push(`wait ${id}`);
			if (options.waitMs) await new Promise((resolve) => setTimeout(resolve, options.waitMs));
			return {
				status: options.exitNever
					? new Promise<number>(() => {})
					: Promise.resolve(options.exitCode ?? 0)
			};
		},
		attach: options.attach
			? options.attach
			: async (id: string, onFrame: (s: 1 | 2, p: Buffer) => void) => {
					calls.push(`attach ${id}`);
					return {
						sendInput() {
							if (options.output) onFrame(1, Buffer.from(`${options.output}\n`));
							if (!options.neverEnds) end();
						},
						closed,
						destroy: end
					};
				},
		start: async (id: string) => {
			calls.push(`start ${id}`);
		},
		kill: async (id: string) => {
			calls.push(`kill ${id}`);
			if (options.killFails) throw new Error('daemon down');
		},
		remove: vi.fn(async (id: string) => {
			calls.push(`remove ${id}`);
			if (options.removeFails) throw new Error('daemon down');
		})
	} as unknown as Engine;
	return { engine, calls };
}

describe('Container: how it ends', () => {
	it('ends exited with the exit code, feeds stdin and passes the frames to the sink', async () => {
		const { engine } = fakeEngine({ output: 'hello', exitCode: 3 });
		const frames: string[] = [];

		const end = await run(engine, {
			frame: (stream, payload) => {
				frames.push(`${stream}:${payload.toString().trim()}`);
				return true;
			}
		});

		expect(end).toEqual({ kind: 'exited', code: 3 });
		expect(frames).toEqual(['1:hello']);
	});

	it('creates the container with the spec, with a Cmd or Env override on top', async () => {
		const { engine } = fakeEngine({});
		const create = vi.spyOn(engine, 'create');

		await run(engine, {
			spec: { Cmd: ['a'], Env: ['A=1'], User: 'nobody' },
			override: { Cmd: ['b'] }
		});

		expect(create.mock.calls[0][0]).toBe('img:1');
		expect(create.mock.calls[0][1]).toEqual({ Cmd: ['b'], Env: ['A=1'], User: 'nobody' });
	});

	it("ignores keys of an override other than Cmd and Env, and an unset Cmd keeps the spec's", async () => {
		const { engine } = fakeEngine({});
		const create = vi.spyOn(engine, 'create');

		await run(engine, {
			spec: { Cmd: ['a'], Env: ['A=1'], Image: 'safe', HostConfig: { Memory: 1 } },
			override: { Cmd: undefined, Image: 'evil', HostConfig: {} } as never
		});

		expect(create.mock.calls[0][1]).toEqual({
			Cmd: ['a'],
			Env: ['A=1'],
			Image: 'safe',
			HostConfig: { Memory: 1 }
		});
	});

	it('waits for the exit status, attaches, then starts, and removes the container last', async () => {
		const { engine, calls } = fakeEngine({});

		await run(engine);

		expect(calls).toEqual(['wait c1', 'attach c1', 'start c1', 'remove c1']);
	});

	it('refuses to start a container whose start-up outlasted the container clock', async () => {
		vi.useFakeTimers();
		try {
			const { engine, calls } = fakeEngine({ waitMs: sandboxConfig.containerTimeoutMs + 1 });
			const pending = run(engine);
			const outcome = expect(pending).rejects.toThrow('Sandbox start-up exceeded the time limit');

			await vi.advanceTimersByTimeAsync(sandboxConfig.containerTimeoutMs + 1);

			await outcome;
			expect(calls).not.toContain('start c1');
			expect(calls).toContain('remove c1');
		} finally {
			vi.useRealTimers();
		}
	});

	it('ends hardStop, kills the container and removes it when the container clock runs out', async () => {
		vi.useFakeTimers();
		try {
			const { engine, calls } = fakeEngine({ neverEnds: true, exitCode: 137 });
			const pending = run(engine);

			await vi.advanceTimersByTimeAsync(sandboxConfig.containerTimeoutMs + 1);

			expect(await pending).toEqual({ kind: 'hardStop' });
			expect(calls).toContain('kill c1');
			expect(calls).toContain('remove c1');
		} finally {
			vi.useRealTimers();
		}
	});

	it('still ends hardStop, removes the container and logs when the kill is rejected', async () => {
		vi.useFakeTimers();
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { engine, calls } = fakeEngine({ neverEnds: true, exitCode: 137, killFails: true });
			const pending = run(engine);

			await vi.advanceTimersByTimeAsync(sandboxConfig.containerTimeoutMs + 1);

			expect(await pending).toEqual({ kind: 'hardStop' });
			expect(calls).toContain('remove c1');
			expect(logged).toHaveBeenCalledWith('Could not kill container c1', expect.any(Error));
		} finally {
			logged.mockRestore();
			vi.useRealTimers();
		}
	});

	it('ends overflow when the sink refuses a frame: the attach is destroyed and the container removed', async () => {
		const { engine, calls } = fakeEngine({ output: 'too much', neverEnds: true });
		let destroyed = false;
		const attach = engine.attach.bind(engine);
		engine.attach = (async (...args: Parameters<Engine['attach']>) => {
			const attached = await attach(...args);
			return {
				...attached,
				destroy() {
					destroyed = true;
					attached.destroy();
				}
			};
		}) as Engine['attach'];

		vi.useFakeTimers();
		let end: Awaited<ReturnType<typeof run>>;
		try {
			const pending = run(engine, { frame: () => false });
			let settled = false;
			void pending.then(() => (settled = true));
			// No timer is advanced: the Run ends on the refused frame, not on the container clock.
			await vi.advanceTimersByTimeAsync(0);
			expect(settled).toBe(true);
			end = await pending;
		} finally {
			vi.useRealTimers();
		}

		expect(end).toEqual({ kind: 'overflow' });
		expect(destroyed).toBe(true);
		expect(calls).toContain('remove c1');
	});

	it('stops offering frames to the sink after the first refusal', async () => {
		const { engine } = fakeEngine({});
		const attach = engine.attach.bind(engine);
		let offered = 0;
		engine.attach = (async (id: string, onFrame: (s: 1 | 2, p: Buffer) => void, ms: number) => {
			const attached = await attach(id, onFrame, ms);
			return {
				...attached,
				sendInput() {
					onFrame(1, Buffer.from('a'));
					onFrame(1, Buffer.from('b'));
					attached.sendInput(new Uint8Array());
				}
			};
		}) as Engine['attach'];

		await run(engine, {
			frame: () => {
				offered++;
				return false;
			}
		});

		expect(offered).toBe(1);
	});

	it('fails when the exit status never arrives, and still removes the container', async () => {
		vi.useFakeTimers();
		try {
			const { engine, calls } = fakeEngine({ exitNever: true });
			const outcome = expect(run(engine)).rejects.toThrow(/Timed out waiting for the Sandbox exit/);

			await vi.advanceTimersByTimeAsync(sandboxConfig.exitStatusTimeoutMs + 1);
			await outcome;

			expect(calls).toContain('remove c1');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('deadline', () => {
	it('counts down on the clock it was made on and rejects a promise that outlives it', async () => {
		vi.useFakeTimers();
		try {
			const d = deadline(1_000);
			await vi.advanceTimersByTimeAsync(400);
			expect(d.left()).toBe(600);

			const outcome = expect(d.bound(new Promise(() => {}), 'too slow')).rejects.toThrow(
				'too slow'
			);
			await vi.advanceTimersByTimeAsync(600);
			await outcome;
			expect(d.left()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('caps one wait below what is left, and passes a result or an error through', async () => {
		vi.useFakeTimers();
		try {
			const d = deadline(10_000);
			const capped = expect(d.bound(new Promise(() => {}), 'capped', 100)).rejects.toThrow(
				'capped'
			);
			await vi.advanceTimersByTimeAsync(100);
			await capped;

			await expect(d.bound(Promise.resolve(7), 'late')).resolves.toBe(7);
			await expect(d.bound(Promise.reject(new Error('boom')), 'late')).rejects.toThrow('boom');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('Container: leaks and stalls', () => {
	it('retries a failing remove three times and does not mask the original error', async () => {
		const { engine } = fakeEngine({
			attach: async () => Promise.reject(new Error('attach failed')),
			removeFails: true
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(run(engine)).rejects.toThrow(/attach failed/);

		expect(engine.remove).toHaveBeenCalledTimes(3);
	});

	it('gives up on cleanup after about 30 s even if the daemon never answers a remove', async () => {
		vi.useFakeTimers();
		try {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const { engine } = fakeEngine({});
			engine.remove = vi.fn(() => new Promise<boolean>(() => {}));
			const started = Date.now();
			const pending = run(engine);
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

	it('bounds a stalled attach by the engine attach handshake and kills the container at the container clock', async () => {
		vi.useFakeTimers();
		try {
			let stalled: (e: Error) => void = () => {};
			let handshakeMs: unknown;
			const { engine, calls } = fakeEngine({
				attach: ((_id: string, _onFrame: unknown, ms: unknown) => {
					handshakeMs = ms;
					return new Promise<never>((_, reject) => {
						stalled = reject;
					});
				}) as () => Promise<never>
			});
			const pending = run(engine);
			const outcome = expect(pending).rejects.toThrow();

			await vi.advanceTimersByTimeAsync(sandboxConfig.containerTimeoutMs + 1);
			expect(calls).toContain('kill c1');
			stalled(new Error('Docker attach timed out'));
			await outcome;

			expect(handshakeMs).toBe(sandboxConfig.attachTimeoutMs);
			expect(calls).toContain('remove c1');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('Container: a create that fails or times out', () => {
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

		await expect(run(engine)).rejects.toThrow(/timed out/);

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

		await expect(run(engine)).rejects.toThrow();
		await expect(run(engine)).rejects.toThrow();

		expect(names[0]).toMatch(/^bl-inst-1-[0-9a-f]{16}$/);
		expect(names[0]).not.toBe(names[1]);
		expect(removed).toEqual(names);
	});

	it('gives up after a few tries when the daemon made nothing, keeping the create error', async () => {
		const { engine, removeCalls } = daemon(new Error('timed out'), 0);
		vi.useFakeTimers();

		const pending = expect(run(engine)).rejects.toThrow(/timed out/);
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

		const pending = expect(run(engine)).rejects.toThrow(/timed out/);
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

		const pending = expect(run(engine)).rejects.toThrow(/create timed out/);
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
		const pending = run(engine).catch(() => {
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

		await expect(run(engine)).rejects.toThrow(/409/);

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

		await expect(run(engine)).rejects.toThrow(/missing/);

		expect(remove).not.toHaveBeenCalled();
	});
});

describe('Container: bounds on the create-failure cleanup', () => {
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

		const pending = run(engine).catch(() => {
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

		const runs = Array.from({ length: 100 }, () => run(engine).catch(() => {}));
		await vi.advanceTimersByTimeAsync(1_000);
		await Promise.all(runs);
		// 100 tries inside the Runs, and no late try yet.
		expect(engine.remove).toHaveBeenCalledTimes(100);
		await vi.advanceTimersByTimeAsync(31_000);
		expect(engine.remove).toHaveBeenCalledTimes(164);

		// The slots are free again once the late removes have run.
		const again = run(engine).catch(() => {});
		await vi.advanceTimersByTimeAsync(31_000);
		await again;
		expect(engine.remove).toHaveBeenCalledTimes(166);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
});

describe('Container: cleanup pauses and late-remove slots', () => {
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

		const pending = run(engine).catch(() => {
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
		const attempt = () => run(engine).catch(() => {});

		const first = Array.from({ length: 64 }, attempt);
		await vi.advanceTimersByTimeAsync(5_000);
		await Promise.all(first);
		await vi.advanceTimersByTimeAsync(31_000);
		const afterFirst = (engine.remove as ReturnType<typeof vi.fn>).mock.calls.length;
		// 64 late removes are in flight (hanging, still counted); 64 more Runs make only their own try, no late one.
		const second = Array.from({ length: 64 }, attempt);
		await vi.advanceTimersByTimeAsync(5_000);
		await Promise.all(second);
		await vi.advanceTimersByTimeAsync(31_000);
		expect((engine.remove as ReturnType<typeof vi.fn>).mock.calls.length - afterFirst).toBe(64);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('frees a late remove slot once, when the engine gives up on a removal stuck in progress', async () => {
		// The engine's in-progress poll ends at its own 15 s deadline by rejecting.
		let late = false;
		const engine = {
			create: async () => {
				throw new Error('daemon down');
			},
			remove: vi.fn(() =>
				late
					? new Promise<boolean>((_, reject) =>
							setTimeout(() => reject(new Error('removal is still in progress')), 15_000)
						)
					: Promise.reject(new Error('fail fast'))
			)
		} as unknown as Engine;
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.useFakeTimers();
		const attempt = () => run(engine).catch(() => {});
		const batch = async (count: number) => {
			late = false;
			const runs = Array.from({ length: count }, attempt);
			await vi.advanceTimersByTimeAsync(5_000);
			await Promise.all(runs);
			late = true;
			await vi.advanceTimersByTimeAsync(31_000);
		};

		await batch(64);
		// 31 s on, the 64 stuck removes are past their 15 s deadline: all slots are free again.
		await vi.advanceTimersByTimeAsync(15_000);
		const before = (engine.remove as ReturnType<typeof vi.fn>).mock.calls.length;
		// More Runs than slots: a double free would let more than 64 late removes through.
		await batch(70);
		await vi.advanceTimersByTimeAsync(15_000);
		expect((engine.remove as ReturnType<typeof vi.fn>).mock.calls.length - before).toBe(70 + 64);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
});
