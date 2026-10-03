import { describe, expect, it } from 'vitest';
import { readRunnerEnv } from './config';

const token = 't'.repeat(32);
const base = { RUNNER_TOKEN: token, RUNNER_PORT: '8787' };

describe('readRunnerEnv', () => {
	it('applies the defaults', () => {
		expect(readRunnerEnv(base, 6)).toEqual({
			token,
			port: 8787,
			host: '0.0.0.0',
			maxConcurrent: 6,
			dockerSocket: '/var/run/docker.sock'
		});
	});

	it('reads host and concurrency from the environment', () => {
		const env = {
			...base,
			RUNNER_HOST: '127.0.0.1',
			RUNNER_MAX_CONCURRENT: '3'
		};

		expect(readRunnerEnv(env, 6)).toMatchObject({
			host: '127.0.0.1',
			maxConcurrent: 3
		});
	});

	it.each([
		['a missing token', { ...base, RUNNER_TOKEN: undefined }],
		['a token of 31 characters', { ...base, RUNNER_TOKEN: 't'.repeat(31) }],
		['a missing port', { ...base, RUNNER_PORT: undefined }],
		['a port out of range', { ...base, RUNNER_PORT: '70000' }],
		['zero concurrent runs', { ...base, RUNNER_MAX_CONCURRENT: '0' }],
		['a non-numeric concurrency', { ...base, RUNNER_MAX_CONCURRENT: 'lots' }]
	])('refuses to start with %s', (_name, env) => {
		expect(() => readRunnerEnv(env, 6)).toThrow();
	});
});
