/** The Runner's HTTP surface: `POST /execute` and `GET /health`, both behind a bearer token. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { LANGUAGE_IDS } from '../../languages';
import { sandboxConfig } from './config';
import { buildPathsIssue, type RunnerPort } from './port';

const executeRequest = z.object({
	language: z.enum(LANGUAGE_IDS),
	files: z
		.record(z.string(), z.string())
		// The same rule the Learning core applies before it saves a Build (runner/port.ts).
		.superRefine((files, ctx) => {
			const issue = buildPathsIssue(Object.keys(files));
			if (issue) ctx.addIssue({ code: 'custom', message: issue });
		}),
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
	/** How long a request waits for a free slot before 503 "busy". */
	queueWaitMs?: number;
	/** Most requests waiting for a slot; one more gets 503 "busy" at once. */
	maxQueued?: number;
}) {
	const queueWaitMs = options.queueWaitMs ?? sandboxConfig.queueWaitMs;
	const maxQueued = options.maxQueued ?? sandboxConfig.maxQueued;
	const expected = digest(`Bearer ${options.token}`);
	let running = 0;
	/** Requests waiting for a slot, oldest first. A slot freed with someone waiting passes straight to them. */
	const waiting: (() => void)[] = [];

	/** True once the caller holds a slot; false when none freed in time, the queue was full or the caller left. */
	function acquire(signal: AbortSignal): Promise<boolean> {
		if (running < options.maxConcurrent) {
			running++;
			return Promise.resolve(true);
		}
		if (waiting.length >= maxQueued || signal.aborted) return Promise.resolve(false);
		return new Promise((resolve) => {
			const leave = () => {
				clearTimeout(timer);
				signal.removeEventListener('abort', onAbort);
				const at = waiting.indexOf(grant);
				if (at !== -1) waiting.splice(at, 1);
			};
			const grant = () => {
				leave();
				resolve(true); // the slot's `running` count passes to this request
			};
			const giveUp = () => {
				leave();
				resolve(false);
			};
			const onAbort = giveUp;
			const timer = setTimeout(giveUp, queueWaitMs);
			signal.addEventListener('abort', onAbort, { once: true });
			waiting.push(grant);
		});
	}

	function release(): void {
		const next = waiting.shift();
		if (next) next();
		else running--;
	}

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

		// A full Runner holds the request for a bounded wait (`queueWaitMs`, `maxQueued`), then says so.
		if (!(await acquire(req.signal))) return json(503, { error: 'Runner is busy' });
		try {
			return json(200, await options.runner.execute(parsed.data));
		} catch (error) {
			console.error('Runner failed to execute a request', error);
			return json(500, { error: 'Runner failed to execute the request' });
		} finally {
			release();
		}
	};
}
