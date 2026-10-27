import { describe, expect, it, vi } from 'vitest';
import { sandboxConfig } from './config';
import { createScriptedRunner } from './fake';
import { MAX_BUILD_FILES } from './port';
import { createRunnerHandler } from './server';

const token = 'secret';
const valid = {
	language: 'python',
	files: { 'main.py': 'print(1)' },
	tests: [{ id: 'a', input: 'x' }],
	limits: { timeoutMs: 1000, memoryMb: 128 }
};

function setup() {
	const runner = createScriptedRunner({
		tests: { a: { status: 'ok', stdout: 'x' } }
	});
	return {
		runner,
		handle: createRunnerHandler({
			token,
			runner,
			maxConcurrent: 4,
			readyLanguages: () => ['python', 'typescript', 'go']
		})
	};
}

const post = (body: unknown, auth: string | null = `Bearer ${token}`) =>
	new Request('http://runner/execute', {
		method: 'POST',
		headers: auth ? { Authorization: auth } : {},
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});

describe('Runner HTTP handler', () => {
	it('answers 401 without the bearer token, on every route', async () => {
		const { handle, runner } = setup();

		for (const req of [
			post(valid, null),
			post(valid, 'Bearer wrong'),
			post(valid, token),
			new Request('http://runner/health'),
			new Request('http://runner/anything')
		]) {
			expect((await handle(req)).status).toBe(401);
		}
		expect(runner.calls).toEqual([]);
	});

	it('reports health to a caller with the token', async () => {
		const { handle } = setup();

		const res = await handle(
			new Request('http://runner/health', {
				headers: { Authorization: `Bearer ${token}` }
			})
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			ready: true,
			languages: ['python', 'typescript', 'go']
		});
	});

	it('executes a valid request through the runner and returns its result', async () => {
		const { handle, runner } = setup();

		const res = await handle(post(valid));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			results: [{ id: 'a', status: 'ok', stdout: 'x', stderr: '' }]
		});
		expect(runner.calls).toEqual([valid]);
	});

	it('drops an expected output smuggled into a Test before it reaches the runner', async () => {
		const { handle, runner } = setup();

		await handle(post({ ...valid, tests: [{ id: 'a', input: 'x', expected: 'secret' }] }));

		expect(runner.calls[0].tests).toEqual([{ id: 'a', input: 'x' }]);
	});

	it.each([
		['not JSON', 'nope'],
		['a missing field', { ...valid, limits: undefined }],
		['an unknown language', { ...valid, language: 'ruby' }],
		['a file path that escapes the build', { ...valid, files: { '../evil': '' } }],
		['an absolute file path', { ...valid, files: { '/etc/x': '' } }],
		[
			'lone surrogates in file paths',
			{ ...valid, files: { 'main.py': 'x', 'x\ud800': '1', 'x\udc00/y': '2' } }
		],
		['a file path with a null byte', { ...valid, files: { 'a\0b.py': '' } }],
		[
			'more than 200 Tests',
			{
				...valid,
				tests: Array.from({ length: 201 }, () => ({ id: 'a', input: '' }))
			}
		],
		[
			'more than 64 files',
			{
				...valid,
				files: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`f${i}.py`, '']))
			}
		],
		['a memory limit under 32 MiB', { ...valid, limits: { timeoutMs: 1000, memoryMb: 31 } }],
		['a file that is also a directory', { ...valid, files: { 'a/b': '', a: '' } }],
		['a file under a file deeper down', { ...valid, files: { 'a/b/c': '', 'a/b': '' } }],
		['a file path too long for the archive', { ...valid, files: { [`${'a'.repeat(95)}`]: '' } }]
	])('answers 400 for %s', async (_name, body) => {
		const { handle, runner } = setup();

		expect((await handle(post(body))).status).toBe(400);
		expect(runner.calls).toEqual([]);
	});

	it('shares its file limit with the Build rule the Learning core applies', () => {
		expect(sandboxConfig.maxFiles).toBe(MAX_BUILD_FILES);
	});

	it('answers 500 without details when the runner throws', async () => {
		const handle = createRunnerHandler({
			token,
			runner: createScriptedRunner({ unavailable: true }),
			maxConcurrent: 4,
			readyLanguages: () => ['python', 'typescript', 'go']
		});

		const res = await handle(post(valid));

		expect(res.status).toBe(500);
		expect(JSON.stringify(await res.json())).not.toContain('scripted');
	});

	it('accepts the largest request the limits allow', async () => {
		const { handle, runner } = setup();
		const body = {
			...valid,
			files: Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`f${i}.py`, ''])),
			tests: Array.from({ length: 200 }, () => ({ id: 'a', input: '' })),
			limits: { timeoutMs: 1000, memoryMb: 32 }
		};

		expect((await handle(post(body))).status).toBe(200);
		expect(runner.calls).toHaveLength(1);
	});

	describe('when the runs in flight are at the limit', () => {
		const ready = () => ['python', 'typescript', 'go'];
		const idle = { ...valid, tests: [] };
		/** A Runner whose runs each wait for `finishOne`, so a test decides when a slot frees. */
		function gated() {
			const pending: (() => void)[] = [];
			return {
				runner: {
					execute: () =>
						new Promise<{ results: never[] }>((resolve) => {
							pending.push(() => resolve({ results: [] }));
						})
				},
				finishOne: () => pending.shift()?.(),
				started: () => pending.length
			};
		}

		it('holds a request for a slot, and runs it once one frees', async () => {
			const g = gated();
			const handle = createRunnerHandler({
				token,
				runner: g.runner,
				maxConcurrent: 1,
				queueWaitMs: 1000,
				maxQueued: 4,
				readyLanguages: ready
			});

			const first = handle(post(idle));
			const queued = handle(post(idle));
			await new Promise((r) => setTimeout(r, 10));
			expect(g.started()).toBe(1);
			g.finishOne();
			expect((await first).status).toBe(200);
			await new Promise((r) => setTimeout(r, 10));
			expect(g.started()).toBe(1);
			g.finishOne();

			expect((await queued).status).toBe(200);
		});

		it('answers 503 busy when no slot frees within the wait, and runs nothing for it', async () => {
			const g = gated();
			const handle = createRunnerHandler({
				token,
				runner: g.runner,
				maxConcurrent: 1,
				queueWaitMs: 30,
				maxQueued: 4,
				readyLanguages: ready
			});

			const first = handle(post(idle));
			const refused = await handle(post(idle));

			expect(refused.status).toBe(503);
			expect(await refused.json()).toEqual({ error: 'Runner is busy' });
			expect(g.started()).toBe(1);
			g.finishOne();
			await first;
		});

		it('answers 503 at once when the queue is full', async () => {
			const g = gated();
			const handle = createRunnerHandler({
				token,
				runner: g.runner,
				maxConcurrent: 1,
				queueWaitMs: 5000,
				maxQueued: 1,
				readyLanguages: ready
			});

			const first = handle(post(idle));
			const queued = handle(post(idle));
			const t = Date.now();
			const refused = await handle(post(idle));

			expect(refused.status).toBe(503);
			expect(Date.now() - t).toBeLessThan(1000);
			g.finishOne();
			await first;
			await new Promise((r) => setTimeout(r, 10));
			g.finishOne();
			expect((await queued).status).toBe(200);
		});

		it('serves the queue in arrival order, and frees the slot when a run throws', async () => {
			const order: string[] = [];
			const gates: (() => void)[] = [];
			const handle = createRunnerHandler({
				token,
				runner: {
					execute: (request) => {
						order.push(request.tests[0]?.id ?? '');
						return new Promise((resolve, reject) => {
							gates.push(() =>
								order.length === 1 ? reject(new Error('boom')) : resolve({ results: [] })
							);
						});
					}
				},
				maxConcurrent: 1,
				queueWaitMs: 1000,
				maxQueued: 4,
				readyLanguages: ready
			});
			const req = (id: string) => post({ ...valid, tests: [{ id, input: '' }] });

			const a = handle(req('a'));
			const b = handle(req('b'));
			const c = handle(req('c'));
			await new Promise((r) => setTimeout(r, 10));
			gates.shift()?.();
			expect((await a).status).toBe(500);
			await new Promise((r) => setTimeout(r, 10));
			gates.shift()?.();
			expect((await b).status).toBe(200);
			await new Promise((r) => setTimeout(r, 10));
			gates.shift()?.();
			expect((await c).status).toBe(200);

			expect(order).toEqual(['a', 'b', 'c']);
		});

		it('answers 503 before reading the body when slots and queue are both full', async () => {
			const g = gated();
			const handle = createRunnerHandler({
				token,
				runner: g.runner,
				maxConcurrent: 1,
				queueWaitMs: 5000,
				maxQueued: 0,
				readyLanguages: ready
			});
			const first = handle(post(idle));
			await new Promise((r) => setTimeout(r, 10));
			const refused = await handle(post('not json at all'));

			expect(refused.status).toBe(503);
			g.finishOne();
			await first;
		});

		it('answers 503 not ready when the Language left the ready set while the request waited', async () => {
			const g = gated();
			let languages = ['python'];
			const handle = createRunnerHandler({
				token,
				runner: g.runner,
				maxConcurrent: 1,
				queueWaitMs: 5000,
				maxQueued: 4,
				readyLanguages: () => languages
			});
			const first = handle(post(idle));
			const queued = handle(post(idle));
			await new Promise((r) => setTimeout(r, 10));
			languages = [];
			g.finishOne();
			await first;
			const res = await queued;

			expect(res.status).toBe(503);
			expect(await res.json()).toEqual({ error: 'Runner is not ready' });
			expect(g.started()).toBe(0);
			// the slot it held is back
			languages = ['python'];
			const next = handle(post(idle));
			await new Promise((r) => setTimeout(r, 10));
			expect(g.started()).toBe(1);
			g.finishOne();
			await next;
		});

		it('does not run a request whose caller left the moment it was granted a slot', async () => {
			const g = gated();
			const handle = createRunnerHandler({
				token,
				runner: g.runner,
				maxConcurrent: 1,
				queueWaitMs: 5000,
				maxQueued: 4,
				readyLanguages: ready
			});
			const gone = new AbortController();
			const first = handle(post(idle));
			const queued = handle(
				new Request('http://runner/execute', {
					method: 'POST',
					headers: { Authorization: `Bearer ${token}` },
					body: JSON.stringify(idle),
					signal: gone.signal
				})
			);
			await new Promise((r) => setTimeout(r, 10));
			g.finishOne(); // grants the slot to `queued` ...
			gone.abort(); // ... and the caller leaves before it resumes
			await first;
			const res = await queued;

			expect(res.status).toBe(503);
			expect(g.started()).toBe(0);
			const next = handle(post(idle));
			await new Promise((r) => setTimeout(r, 10));
			expect(g.started()).toBe(1);
			g.finishOne();
			await next;
		});

		describe('on the exact tick the wait ends', () => {
			function waitOf100() {
				const g = gated();
				const handle = createRunnerHandler({
					token,
					runner: g.runner,
					maxConcurrent: 1,
					queueWaitMs: 100,
					maxQueued: 4,
					readyLanguages: ready
				});
				return { g, handle };
			}
			it('a slot freed just before the timer fires goes to the waiter', async () => {
				vi.useFakeTimers();
				try {
					const { g, handle } = waitOf100();
					const first = handle(post(idle));
					const queued = handle(post(idle));
					await vi.advanceTimersByTimeAsync(99);
					g.finishOne();
					await vi.advanceTimersByTimeAsync(1);
					expect(g.started()).toBe(1);
					g.finishOne();

					expect((await first).status).toBe(200);
					expect((await queued).status).toBe(200);
				} finally {
					vi.useRealTimers();
				}
			});
			it('a timeout just before the slot frees leaves the slot free, not double counted', async () => {
				vi.useFakeTimers();
				try {
					const { g, handle } = waitOf100();
					const first = handle(post(idle));
					const queued = handle(post(idle));
					await vi.advanceTimersByTimeAsync(100);
					expect((await queued).status).toBe(503);
					g.finishOne();
					expect((await first).status).toBe(200);
					const a = handle(post(idle));
					const b = handle(post(idle));
					await vi.advanceTimersByTimeAsync(0);
					expect(g.started()).toBe(1); // one slot, not two
					g.finishOne();
					await a;
					await vi.advanceTimersByTimeAsync(0);
					g.finishOne();
					expect((await b).status).toBe(200);
				} finally {
					vi.useRealTimers();
				}
			});
		});

		it('drops a queued request whose caller went away, without running it', async () => {
			const g = gated();
			const handle = createRunnerHandler({
				token,
				runner: g.runner,
				maxConcurrent: 1,
				queueWaitMs: 5000,
				maxQueued: 4,
				readyLanguages: ready
			});
			const gone = new AbortController();

			const first = handle(post(idle));
			const abandoned = handle(
				new Request('http://runner/execute', {
					method: 'POST',
					headers: { Authorization: `Bearer ${token}` },
					body: JSON.stringify(idle),
					signal: gone.signal
				})
			);
			await new Promise((r) => setTimeout(r, 10));
			gone.abort();
			await abandoned;
			g.finishOne();
			await first;
			await new Promise((r) => setTimeout(r, 10));

			expect(g.started()).toBe(0);
		});
	});

	it('answers 404 and 405 for unknown routes and methods', async () => {
		const { handle } = setup();
		const auth = { Authorization: `Bearer ${token}` };

		expect((await handle(new Request('http://runner/nope', { headers: auth }))).status).toBe(404);
		expect((await handle(new Request('http://runner/execute', { headers: auth }))).status).toBe(
			405
		);
	});

	describe('while the Sandbox images are still being pulled', () => {
		const auth = { Authorization: `Bearer ${token}` };
		const typescript = {
			...valid,
			language: 'typescript',
			files: { 'main.ts': '' }
		};

		function pulling() {
			const runner = createScriptedRunner({
				tests: { a: { status: 'ok', stdout: 'x' } }
			});
			const ready: string[] = [];
			const handle = createRunnerHandler({
				token,
				runner,
				maxConcurrent: 4,
				readyLanguages: () => ready
			});
			const health = () => handle(new Request('http://runner/health', { headers: auth }));
			return {
				runner,
				handle,
				health,
				becomeReady: (language: string) => ready.push(language)
			};
		}

		it('answers /health 503 {ready:false}, then 200 listing the ready Languages', async () => {
			const { health, becomeReady } = pulling();

			const before = await health();
			becomeReady('python');
			const afterPython = await health();
			becomeReady('typescript');
			const afterBoth = await health();

			expect(before.status).toBe(503);
			expect(await before.json()).toEqual({ ready: false });
			expect(afterPython.status).toBe(200);
			expect(await afterPython.json()).toEqual({
				ready: true,
				languages: ['python']
			});
			expect(await afterBoth.json()).toEqual({
				ready: true,
				languages: ['python', 'typescript']
			});
		});

		it('runs Python while TypeScript is pulling, answers TypeScript 503, then serves it', async () => {
			const { handle, runner, becomeReady } = pulling();

			becomeReady('python');
			const python = await handle(post(valid));
			const missing = await handle(post(typescript));
			expect(runner.calls).toHaveLength(1);
			becomeReady('typescript');
			const after = await handle(post(typescript));

			expect(python.status).toBe(200);
			expect(missing.status).toBe(503);
			expect(await missing.json()).toEqual({ error: 'Runner is not ready' });
			expect(after.status).toBe(200);
			expect(runner.calls).toHaveLength(2);
		});

		it('answers /execute 503 while no image is ready', async () => {
			const { handle, runner } = pulling();

			expect((await handle(post(valid))).status).toBe(503);
			expect(runner.calls).toEqual([]);
		});

		it('still answers 401 first to a caller without the token', async () => {
			const { handle } = pulling();

			expect((await handle(new Request('http://runner/health'))).status).toBe(401);
		});
	});
});
