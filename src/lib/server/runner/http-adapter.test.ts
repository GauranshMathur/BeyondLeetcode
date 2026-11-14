import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_IDS } from '../../languages';
import { MAX_BUILD_BYTES } from '../submit-plan';
import { sandboxConfig } from './config';
import { createHttpRunner, worstCaseBodyBytes } from './http-adapter';

let server: Server;
afterEach(() => {
	server?.close();
	vi.restoreAllMocks();
});

const TOKEN = 'token-for-the-test-only';
const CODE = 'secret_learner_code_marker';
const RESPONSE_BODY = 'response-body-marker';

async function runnerAnswering(status: number, body: string): Promise<string> {
	server = createServer((_req, res) => {
		res.writeHead(status, { 'Content-Type': 'application/json' }).end(body);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as { port: number };
	return `http://127.0.0.1:${port}`;
}

function run(url: string) {
	return createHttpRunner({ url, token: TOKEN }).execute({
		language: 'python',
		files: { 'main.py': CODE },
		tests: [{ id: 'a', input: CODE }],
		limits: { timeoutMs: 1000, memoryMb: 128 }
	});
}

/** The lines the adapter logged for one failed call. */
async function loggedFor(url: string): Promise<string[]> {
	const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
	await expect(run(url)).rejects.toThrow();
	return spy.mock.calls.map((call) => call.join(' '));
}

describe('HTTP runner adapter failures', () => {
	const cases: [string, number, string, string][] = [
		['unauthorized', 401, `{"error":"${RESPONSE_BODY}"}`, 'runner RunnerUnauthorized'],
		['refused', 400, `{"error":"${RESPONSE_BODY}"}`, 'runner RunnerRefused'],
		['busy', 503, '{"error":"Runner is busy"}', 'runner RunnerBusy'],
		['not ready (execute)', 503, '{"error":"Runner is not ready"}', 'runner RunnerNotReady'],
		['busy, unreadable body', 503, '', 'runner RunnerBusy'],
		['failed (500)', 500, `{"error":"${RESPONSE_BODY}"}`, 'runner RunnerFailed'],
		['failed (404)', 404, `{"error":"${RESPONSE_BODY}"}`, 'runner RunnerFailed'],
		['failed (405)', 405, `{"error":"${RESPONSE_BODY}"}`, 'runner RunnerFailed'],
		['failed (413)', 413, `{"error":"${RESPONSE_BODY}"}`, 'runner RunnerFailed'],
		[
			'failed (a 200 that is not a result)',
			200,
			`{"results":"${RESPONSE_BODY}"}`,
			'runner RunnerFailed'
		]
	];

	it.each(cases)('%s: one line naming only the kind', async (_name, status, body, line) => {
		const lines = await loggedFor(await runnerAnswering(status, body));
		expect(lines).toEqual([line]);
		for (const secret of [TOKEN, CODE, RESPONSE_BODY, 'Bearer'])
			expect(lines.join('\n')).not.toContain(secret);
	});

	it('maps a refused connection to unreachable', async () => {
		const probe = createServer();
		await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
		const { port } = probe.address() as { port: number };
		await new Promise<void>((resolve) => probe.close(() => resolve()));

		const lines = await loggedFor(`http://127.0.0.1:${port}`);
		expect(lines).toEqual(['runner RunnerUnreachable']);
	});

	it('still rejects with the status, so a caller can tell a Runner answer', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(run(await runnerAnswering(503, '{}'))).rejects.toThrow(/503/);
	});

	it('logs nothing when the Runner answers', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const url = await runnerAnswering(200, '{"results":[]}');
		await expect(run(url)).resolves.toEqual({ results: [] });
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('worstCaseBodyBytes', () => {
	const request = {
		language: 'python' as const,
		files: {},
		tests: [{ id: 'a', input: 'x' }],
		limits: { timeoutMs: 1000, memoryMb: 128 }
	};
	const longest = LANGUAGE_IDS.reduce((a, b) => (b.length > a.length ? b : a));

	it('is the request as sent plus room for the largest Build at its worst escaping', () => {
		const sent = Buffer.byteLength(JSON.stringify({ ...request, language: longest }));
		expect(worstCaseBodyBytes(request)).toBe(
			sent + MAX_BUILD_BYTES * 6 + sandboxConfig.maxFiles * 8
		);
	});

	it('does not depend on the files or the Language the request carries', () => {
		const other = {
			...request,
			language: longest,
			files: { 'main.py': 'print(1)' }
		};
		expect(worstCaseBodyBytes(other)).toBe(worstCaseBodyBytes(request));
	});

	it('covers the body of a Build of control characters, which JSON writes as 6 bytes each', () => {
		const files = { f: '\u0001'.repeat(MAX_BUILD_BYTES - 1) };
		const body = Buffer.byteLength(JSON.stringify({ ...request, language: longest, files }));
		expect(body).toBeLessThanOrEqual(worstCaseBodyBytes(request));
	});

	it('grows with the Tests', () => {
		const bigger = {
			...request,
			tests: [{ id: 'a', input: 'x'.repeat(1000) }]
		};
		expect(worstCaseBodyBytes(bigger)).toBe(worstCaseBodyBytes(request) + 999);
	});
});
