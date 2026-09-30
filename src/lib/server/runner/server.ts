/** The Runner's HTTP surface: `POST /execute` and `GET /health`, both behind a bearer token. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { RunnerPort } from './port';

/** Paths land under `build/` in a ustar archive: relative, no `..`, at most 94 bytes. */
const buildPath = z
	.string()
	.min(1)
	.refine(
		(path) =>
			new TextEncoder().encode(path).length <= 94 &&
			!path.startsWith('/') &&
			!path.includes('\\') &&
			!path.includes('\0') &&
			!path.split('/').some((part) => part === '..' || part === '' || part === '.'),
		'Invalid file path'
	);

const executeRequest = z.object({
	language: z.enum(['python', 'typescript', 'go']),
	files: z.record(buildPath, z.string()),
	// Unknown keys are stripped, so an expected output can never reach a container.
	tests: z.array(z.object({ id: z.string(), input: z.string() })),
	limits: z.object({
		timeoutMs: z.number().int().positive(),
		memoryMb: z.number().int().positive()
	})
});

function digest(value: string): Buffer {
	return createHash('sha256').update(value).digest();
}

function json(status: number, body: unknown): Response {
	return Response.json(body, { status });
}

export function createRunnerHandler(options: { token: string; runner: RunnerPort }) {
	const expected = digest(`Bearer ${options.token}`);

	return async function handle(req: Request): Promise<Response> {
		const given = digest(req.headers.get('authorization') ?? '');
		if (!timingSafeEqual(given, expected)) return json(401, { error: 'Unauthorized' });

		const { pathname } = new URL(req.url);
		if (pathname === '/health' && req.method === 'GET') return json(200, { status: 'ok' });
		if (pathname !== '/execute') return json(404, { error: 'Not found' });
		if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

		let body: unknown;
		try {
			body = await req.json();
		} catch {
			return json(400, { error: 'Body is not JSON' });
		}
		const parsed = executeRequest.safeParse(body);
		if (!parsed.success) return json(400, { error: 'Invalid request' });

		try {
			return json(200, await options.runner.execute(parsed.data));
		} catch (error) {
			console.error('Runner failed to execute a request', error);
			return json(500, { error: 'Runner failed to execute the request' });
		}
	};
}
