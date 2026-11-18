import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_IDS } from '../../languages';
import { loadCatalogue } from '../content/catalogue';
import { runnerSubmissions } from '../load/submissions';
import { sandboxConfig } from './config';
import type { ExecuteRequest, RunnerPort } from './port';
import { createRunnerHandler } from './server';

const fixtureDir = fileURLToPath(new URL('../content/fixture', import.meta.url));

describe('the requests a load test sends', () => {
	it("are accepted by the Runner's own handler: every request answers 200", async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const token = 'load-token-load-token-load-token-1234';
		const runner: RunnerPort = {
			async execute(request: ExecuteRequest) {
				return {
					results: request.tests.map(({ id }) => ({
						id,
						status: 'ok' as const,
						stdout: '',
						stderr: ''
					}))
				};
			}
		};
		const handle = createRunnerHandler({
			token,
			runner,
			maxConcurrent: 4,
			readyLanguages: () => [...LANGUAGE_IDS]
		});

		let sent = 0;
		for (const { calls } of runnerSubmissions(catalogue).submissions) {
			for (const call of calls) {
				const body = JSON.stringify(call);
				expect(Buffer.byteLength(body)).toBeLessThanOrEqual(sandboxConfig.requestBodyMaxBytes);
				const res = await handle(
					new Request('http://runner/execute', {
						method: 'POST',
						headers: { Authorization: `Bearer ${token}` },
						body
					})
				);
				expect(res.status).toBe(200);
				sent++;
			}
		}
		expect(sent).toBeGreaterThan(0);
	});
});
