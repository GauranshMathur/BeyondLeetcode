import { describe, expect, it } from 'vitest';
import { createScriptedRunner } from './fake';
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

	it('answers 503 at once when the runs in flight are at the limit, and recovers after', async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const runner = {
			async execute() {
				await gate;
				return { results: [] };
			}
		};
		const handle = createRunnerHandler({
			token,
			runner,
			maxConcurrent: 2,
			readyLanguages: () => ['python', 'typescript', 'go']
		});

		const first = handle(post({ ...valid, tests: [] }));
		const second = handle(post({ ...valid, tests: [] }));
		const refused = await handle(post({ ...valid, tests: [] }));
		release();
		await Promise.all([first, second]);
		const after = await handle(post({ ...valid, tests: [] }));

		expect(refused.status).toBe(503);
		expect(after.status).toBe(200);
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
