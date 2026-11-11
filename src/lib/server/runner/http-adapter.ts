import { LANGUAGE_IDS } from '../../languages';
import { MAX_BUILD_BYTES } from '../submit-plan';
import { sandboxConfig } from './config';
import { type ExecuteRequest, executeResultSchema, type RunnerPort } from './port';

/** The longest Language id, which makes the largest request body. */
const LONGEST_LANGUAGE_ID = LANGUAGE_IDS.reduce((a, b) => (b.length > a.length ? b : a));

/** `"":"",` around one file's path and contents, rounded up. */
const FILE_JSON_OVERHEAD = 8;

/**
 * The most bytes the body of `request` can reach, for any Build `validateBuild` accepts, whatever Language it carries (its
 * `files` and `language` are ignored). The body is the request's JSON, measured as `execute`
 * sends it, plus room for the largest Build at its worst JSON escaping (a control character
 * becomes 6 bytes, `\u00XX`) and the per-file JSON syntax. Only the adapter knows its encoding,
 * so callers that must stay under the Runner's body limit ask here.
 */
export function worstCaseBodyBytes(request: ExecuteRequest): number {
	const body = JSON.stringify({ ...request, language: LONGEST_LANGUAGE_ID, files: {} });
	return (
		Buffer.byteLength(body) + MAX_BUILD_BYTES * 6 + sandboxConfig.maxFiles * FILE_JSON_OVERHEAD
	);
}

/** Runner port adapter that talks to the Runner process over HTTP. Rejects when it cannot get a result. */
export function createHttpRunner(options: { url: string; token: string }): RunnerPort {
	const endpoint = new URL('/execute', options.url);
	return {
		async execute(request) {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${options.token}`
				},
				body: JSON.stringify(request),
				signal: AbortSignal.timeout(sandboxConfig.adapterTimeoutMs)
			});
			if (!response.ok) throw new Error(`Runner responded ${response.status}`);
			return executeResultSchema.parse(await response.json());
		}
	};
}
