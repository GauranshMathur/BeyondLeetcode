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
	const runner = createScriptedRunner({ tests: { a: { status: 'ok', stdout: 'x' } } });
	return { runner, handle: createRunnerHandler({ token, runner }) };
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
			new Request('http://runner/health', { headers: { Authorization: `Bearer ${token}` } })
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: 'ok' });
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
		['a file path too long for the archive', { ...valid, files: { [`${'a'.repeat(95)}`]: '' } }]
	])('answers 400 for %s', async (_name, body) => {
		const { handle, runner } = setup();

		expect((await handle(post(body))).status).toBe(400);
		expect(runner.calls).toEqual([]);
	});

	it('answers 500 without details when the runner throws', async () => {
		const handle = createRunnerHandler({
			token,
			runner: createScriptedRunner({ unavailable: true })
		});

		const res = await handle(post(valid));

		expect(res.status).toBe(500);
		expect(JSON.stringify(await res.json())).not.toContain('scripted');
	});

	it('answers 404 and 405 for unknown routes and methods', async () => {
		const { handle } = setup();
		const auth = { Authorization: `Bearer ${token}` };

		expect((await handle(new Request('http://runner/nope', { headers: auth }))).status).toBe(404);
		expect((await handle(new Request('http://runner/execute', { headers: auth }))).status).toBe(
			405
		);
	});
});
