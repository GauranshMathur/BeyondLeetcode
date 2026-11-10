import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { LANGUAGE_IDS } from '../../languages';
import { MAX_BUILD_BYTES } from '../submit-plan';
import { sandboxConfig } from './config';
import { createHttpRunner, worstCaseBodyBytes } from './http-adapter';

let server: Server;
afterEach(() => server?.close());

async function runnerAnswering(status: number): Promise<string> {
	server = createServer((_req, res) => {
		res.writeHead(status, { 'Content-Type': 'application/json' }).end('{"error":"busy"}');
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as { port: number };
	return `http://127.0.0.1:${port}`;
}

describe('HTTP runner adapter', () => {
	it('rejects, like any other failure, when the Runner answers 503 busy', async () => {
		const runner = createHttpRunner({
			url: await runnerAnswering(503),
			token: 'x'
		});

		await expect(
			runner.execute({
				language: 'python',
				files: { 'main.py': '' },
				tests: [],
				limits: { timeoutMs: 1000, memoryMb: 128 }
			})
		).rejects.toThrow(/503/);
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
		const other = { ...request, language: longest, files: { 'main.py': 'print(1)' } };
		expect(worstCaseBodyBytes(other)).toBe(worstCaseBodyBytes(request));
	});

	it('covers the body of a Build of control characters, which JSON writes as 6 bytes each', () => {
		const files = { f: '\u0001'.repeat(MAX_BUILD_BYTES - 1) };
		const body = Buffer.byteLength(JSON.stringify({ ...request, language: longest, files }));
		expect(body).toBeLessThanOrEqual(worstCaseBodyBytes(request));
	});

	it('grows with the Tests', () => {
		const bigger = { ...request, tests: [{ id: 'a', input: 'x'.repeat(1000) }] };
		expect(worstCaseBodyBytes(bigger)).toBe(worstCaseBodyBytes(request) + 999);
	});
});
