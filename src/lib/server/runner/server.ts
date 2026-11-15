/** The Runner's HTTP surface: `POST /execute` and `GET /health`, both behind a bearer token. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { sandboxConfig } from './config';
import { buildPathsIssue, executeRequestSchema, type RunnerPort } from './port';

// port.ts's schema plus the Runner's own limits. Unknown keys are still stripped, so an expected
// output can never reach a container.
const executeRequest = executeRequestSchema.extend({
	files: executeRequestSchema.shape.files
		// The same rule the Learning core applies before it saves a Build (runner/port.ts).
		.superRefine((files, ctx) => {
			const issue = buildPathsIssue(Object.keys(files));
			if (issue) ctx.addIssue({ code: 'custom', message: issue });
		}),
	tests: executeRequestSchema.shape.tests.max(sandboxConfig.maxTests),
	limits: executeRequestSchema.shape.limits.extend({
		memoryMb: z.number().int().min(sandboxConfig.minMemoryMb)
	})
});

function digest(value: string): Buffer {
	return createHash('sha256').update(value).digest();
}

/**
 * One log line for a refusal the caller caused, in the shape the web's adapter logs the same failure
 * (`runner <kind>`), so a line in one log matches a line in the other. The line is a fixed string: nothing
 * from the request (token, header, body, path, query) can reach it, so a caller cannot write text into the log.
 */
function logRefusal(kind: 'RunnerUnauthorized' | 'RunnerRefused'): void {
	console.error(`runner ${kind}`);
}

/**
 * One log line for a request that threw while it ran: `runner RunnerFailed` and the error's class name, and
 * nothing else. The message, the stack and the cause are left out because a Docker daemon's reply can reach them.
 * The name comes from the constructor, which no request can set; a name that is not a plain identifier, or a
 * thrown value that is not an Error, is logged as a fixed word.
 */
function logFailure(error: unknown): void {
	let kind = 'NonError';
	// The whole read sits in the try: a Proxy's trap can throw from `instanceof` as well as from the property reads.
	try {
		if (error instanceof Error) {
			kind = 'Error';
			// Read once and require a string: an object with a changing toString could otherwise leak text.
			const name: unknown = error.constructor?.name;
			if (typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) kind = name;
		}
	} catch {
		// a trap or getter that throws leaves the fixed word
	}
	try {
		console.error(`runner RunnerFailed ${kind}`);
	} catch {
		// a failing log must not turn into an unhandled error that replaces the 500 the caller gets
	}
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
		if (!timingSafeEqual(given, expected)) {
			logRefusal('RunnerUnauthorized');
			return json(401, { error: 'Unauthorized' });
		}

		const { pathname } = new URL(req.url);
		if (pathname === '/health' && req.method === 'GET') {
			const languages = options.readyLanguages();
			return languages.length > 0
				? json(200, { ready: true, languages })
				: json(503, { ready: false });
		}
		if (pathname !== '/execute') return json(404, { error: 'Not found' });
		if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

		// Slots and queue both full: refuse before reading a body that could be megabytes.
		if (running >= options.maxConcurrent && waiting.length >= maxQueued)
			return json(503, { error: 'Runner is busy' });

		let body: unknown;
		try {
			body = await req.json();
		} catch {
			// The Runner logs nothing whenever the request's signal is aborted: that covers a caller that left
			// mid-body and a stalled body the server's own idle timeout cuts, as for a caller that leaves during
			// the queue wait. Any other body-read failure is a refusal and is logged.
			if (!req.signal.aborted) logRefusal('RunnerRefused');
			return json(400, { error: 'Body is not JSON' });
		}
		const parsed = executeRequest.safeParse(body);
		if (!parsed.success) {
			logRefusal('RunnerRefused');
			return json(400, { error: 'Invalid request' });
		}
		if (!options.readyLanguages().includes(parsed.data.language))
			return json(503, { error: 'Runner is not ready' });

		// A full Runner holds the request for a bounded wait (`queueWaitMs`, `maxQueued`), then says so.
		if (!(await acquire(req.signal))) return json(503, { error: 'Runner is busy' });
		// The wait can be long: the caller may have left, or the Language's image gone, meanwhile.
		if (req.signal.aborted) {
			release();
			return json(503, { error: 'Runner is busy' });
		}
		if (!options.readyLanguages().includes(parsed.data.language)) {
			release();
			return json(503, { error: 'Runner is not ready' });
		}
		try {
			return json(200, await options.runner.execute(parsed.data));
		} catch (error) {
			logFailure(error);
			return json(500, { error: 'Runner failed to execute the request' });
		} finally {
			release();
		}
	};
}
