import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { decodeRefusal } from '#lib/problem-wire.js';
import { LearningError, type LearningErrorCode } from './learning/core.ts';
import { withLearningErrors } from './learning-http.ts';

async function caught(code: LearningErrorCode, revision?: number) {
	try {
		await withLearningErrors(async () => {
			throw new LearningError(code, revision);
		});
	} catch (e) {
		if (isHttpError(e)) return e;
		throw e;
	}
	throw new Error('did not throw');
}

describe('withLearningErrors', () => {
	it.each([
		['NotFound', 404],
		['TopicLocked', 403],
		['RevisionConflict', 409],
		['InvalidBuild', 400],
		['RunnerUnavailable', 503]
	] as const)('maps %s to %i', async (code, status) => {
		const e = await caught(code);

		expect(e.status).toBe(status);
		// SvelteKit 3 adds the status to every error body.
		expect(e.body).toEqual({ message: code, status });
		expect(decodeRefusal(e.body)).toEqual({ code });
	});

	it('carries the saved revision of a Runner outage in the same error', async () => {
		const e = await caught('RunnerUnavailable', 4);

		expect(e.status).toBe(503);
		expect(e.body).toEqual({ message: 'RunnerUnavailable', revision: 4, status: 503 });
		expect(decodeRefusal(e.body)).toEqual({ code: 'RunnerUnavailable', revision: 4 });
	});

	it('passes the result through and rethrows anything that is not a LearningError', async () => {
		expect(await withLearningErrors(async () => 7)).toBe(7);
		await expect(
			withLearningErrors(async () => {
				throw new TypeError('boom');
			})
		).rejects.toThrow(TypeError);
	});
});
