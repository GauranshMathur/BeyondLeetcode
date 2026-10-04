/** The Runner's HTTP surface: `POST /execute` and `GET /health`, both behind a bearer token. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { sandboxConfig } from './config';
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

/** One path may not be a directory of another: `a` and `a/b` cannot both be extracted. */
function hasNoFileUnderFile(files: Record<string, string>): boolean {
	const paths = new Set(Object.keys(files));
	for (const path of paths) {
		for (let slash = path.indexOf('/'); slash >= 0; slash = path.indexOf('/', slash + 1)) {
			if (paths.has(path.slice(0, slash))) return false;
		}
	}
	return true;
}

const executeRequest = z.object({
	language: z.enum(['python', 'typescript', 'go']),
	files: z
		.record(buildPath, z.string())
		.refine((files) => Object.keys(files).length <= sandboxConfig.maxFiles, 'Too many files')
		.refine(hasNoFileUnderFile, 'A file path is a directory of another'),
	// Unknown keys are stripped, so an expected output can never reach a container.
	tests: z.array(z.object({ id: z.string(), input: z.string() })).max(sandboxConfig.maxTests),
	limits: z.object({
		timeoutMs: z.number().int().positive(),
		memoryMb: z.number().int().min(sandboxConfig.minMemoryMb)
	})
});

function digest(value: string): Buffer {
	return createHash('sha256').update(value).digest();
}

function json(status: number, body: unknown): Response {
	return Response.json(body, { status });
}

export function createRunnerHandler(options: {
	token: string;
	runner: RunnerPort;
	maxConcurrent: number;
	/** Languages whose Sandbox image is present; the rest are still being pulled. */
	readyLanguages: () => readonly string[];
}) {
	const expected = digest(`Bearer ${options.token}`);
	let running = 0;

	return async function handle(req: Request): Promise<Response> {
		const given = digest(req.headers.get('authorization') ?? '');
		if (!timingSafeEqual(given, expected)) return json(401, { error: 'Unauthorized' });

		const { pathname } = new URL(req.url);
		if (pathname === '/health' && req.method === 'GET') {
			const languages = options.readyLanguages();
			return languages.length > 0
				? json(200, { ready: true, languages })
				: json(503, { ready: false });
		}
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
		if (!options.readyLanguages().includes(parsed.data.language))
			return json(503, { error: 'Runner is not ready' });

		// No queue: a full Runner says so at once and the caller reports it as unavailable.
		if (running >= options.maxConcurrent) return json(503, { error: 'Runner is busy' });
		running++;
		try {
			return json(200, await options.runner.execute(parsed.data));
		} catch (error) {
			console.error('Runner failed to execute a request', error);
			return json(500, { error: 'Runner failed to execute the request' });
		} finally {
			running--;
		}
	};
}
