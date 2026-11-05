import { sandboxConfig } from './config';
import { executeResultSchema, type RunnerPort } from './port';

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
