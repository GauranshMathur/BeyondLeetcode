import { describe, expect, it, vi } from 'vitest';
import { LearningError } from '#lib/server/learning/errors.js';
import { load } from './+page.server';

// The Problem read answers first, so an unknown Problem or a Locked Topic never reaches the choice; only a
// Learner who may open the Problem and holds no starting Language is sent there.

function call(options: {
	search?: string;
	startingLanguage?: unknown;
	problem?: ReturnType<typeof vi.fn>;
}) {
	const problem = options.problem ?? vi.fn(async () => ({ id: 'stacks-push' }));
	const startingLanguage = vi.fn(async () => options.startingLanguage);
	const hints = vi.fn(async () => ({ revealed: [] }));
	const solution = vi.fn(async () => ({ code: '' }));
	const event = {
		locals: { identity: {}, learning: { problem, startingLanguage, hints, solution } },
		params: { problemId: 'stacks-push' },
		url: new URL(`http://localhost/problems/stacks-push${options.search ?? ''}`)
	};
	const result = Promise.resolve().then(() => (load as (e: never) => unknown)(event as never));
	return { result, problem, startingLanguage, hints, solution };
}

const refusalOf = (result: Promise<unknown>) =>
	result.then(
		() => undefined,
		(e: { status: number; location?: string; body?: { message: string } }) => e
	);

describe('the Problem route load', () => {
	it('sends a Learner with no starting Language to the choice, with the Problem as next', async () => {
		const { result, hints, solution } = call({ search: '?tab=solution' });

		expect(await refusalOf(result)).toMatchObject({
			status: 303,
			location: '/language?next=%2Fproblems%2Fstacks-push%3Ftab%3Dsolution'
		});
		expect(hints).not.toHaveBeenCalled();
		expect(solution).not.toHaveBeenCalled();
	});

	it('opens the Problem for a Learner whose starting Language is go', async () => {
		const { result, solution } = call({ startingLanguage: 'go', search: '?tab=solution' });

		expect(await result).toMatchObject({ tab: 'solution', problem: { id: 'stacks-push' } });
		expect(solution).toHaveBeenCalled();
	});

	it.each([
		['NotFound', 404],
		['TopicLocked', 403]
	])('answers %s with %i whatever the starting Language is', async (code, status) => {
		const problem = vi.fn(async () => {
			throw new LearningError(code as never);
		});
		const { result, startingLanguage } = call({ problem });

		expect(await refusalOf(result)).toMatchObject({ status });
		expect(startingLanguage).not.toHaveBeenCalled();
	});
});
