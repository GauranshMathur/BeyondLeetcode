import { LANGUAGE_IDS } from '../../languages';
import { logFailure } from '../logging';
import { MAX_BUILD_BYTES } from '../submit-plan';
import { sandboxConfig } from './config';
import { type ExecuteRequest, executeResultSchema, type RunnerPort } from './port';

/** The longest Language id, which makes the largest request body. */
const LONGEST_LANGUAGE_ID = LANGUAGE_IDS.reduce((a, b) => (b.length > a.length ? b : a));

/** `"":"",` around one file's path and contents, rounded up. */
const FILE_JSON_OVERHEAD = 8;

/**
 * The most bytes the body of `request` can reach, for any Build `validateBuild` accepts, whatever
 * Language it carries (its `files` and `language` are ignored). The body is the request's JSON, measured as `execute`
 * sends it, plus room for the largest Build at its worst JSON escaping (a control character
 * becomes 6 bytes, `\u00XX`) and the per-file JSON syntax. Only the adapter knows its encoding,
 * so callers that must stay under the Runner's body limit ask here.
 */
export function worstCaseBodyBytes(request: ExecuteRequest): number {
	const body = JSON.stringify({
		...request,
		language: LONGEST_LANGUAGE_ID,
		files: {}
	});
	return (
		Buffer.byteLength(body) + MAX_BUILD_BYTES * 6 + sandboxConfig.maxFiles * FILE_JSON_OVERHEAD
	);
}

/** Why a call to the Runner failed, as far as the web can tell. */
export type RunnerFailureKind =
	| 'unreachable'
	| 'unauthorized'
	| 'refused'
	| 'busy'
	| 'notReady'
	| 'failed';

/**
 * A failed call to the Runner. Its class name is the only thing the log line carries, so `name` is the
 * kind and nothing from the request or the response reaches the log.
 */
class RunnerFailure extends Error {
	constructor(
		readonly kind: RunnerFailureKind,
		status?: number
	) {
		// The message stays out of the log (only the name is logged); it keeps the status for callers and tests.
		super(status === undefined ? `Runner call failed: ${kind}` : `Runner responded ${status}`);
		this.name = `Runner${kind[0]?.toUpperCase()}${kind.slice(1)}`;
	}
}

/**
 * The kind for a non-2xx answer. 401 is a wrong `RUNNER_TOKEN`, 400 a request the Runner refused, 503 a
 * busy or not-ready Runner (told apart by its `error` text, read here and never logged); anything else, which
 * the Runner does not send today, is a failure.
 */
async function kindOfStatus(response: Response): Promise<RunnerFailureKind> {
	if (response.status === 401 || response.status === 400) {
		await response.body?.cancel().catch(() => {});
		return response.status === 401 ? 'unauthorized' : 'refused';
	}
	if (response.status === 503) {
		const text = await response.text().catch(() => '');
		return text.includes('not ready') ? 'notReady' : 'busy';
	}
	// An unread body would hold the connection open.
	await response.body?.cancel().catch(() => {});
	return 'failed';
}

/** Runner port adapter that talks to the Runner process over HTTP. Rejects when it cannot get a result. */
export function createHttpRunner(options: { url: string; token: string }): RunnerPort {
	const endpoint = new URL('/execute', options.url);
	return {
		async execute(request) {
			let kind: RunnerFailureKind;
			let status: number | undefined;
			try {
				const response = await fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${options.token}`
					},
					body: JSON.stringify(request),
					signal: AbortSignal.timeout(sandboxConfig.adapterTimeoutMs)
				});
				if (response.ok) {
					try {
						return executeResultSchema.parse(await response.json());
					} catch {
						kind = 'failed';
					}
				} else {
					status = response.status;
					kind = await kindOfStatus(response);
				}
			} catch {
				// No answer at all: refused connection, unknown host, reset or the adapter's own timeout.
				kind = 'unreachable';
			}
			const failure = new RunnerFailure(kind, status);
			logFailure('runner', failure);
			throw failure;
		}
	};
}
