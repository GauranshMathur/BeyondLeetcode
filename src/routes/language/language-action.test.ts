import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';

function run(fields: Record<string, string>) {
	const setStartingLanguage = vi.fn(async () => {});
	const form = new URLSearchParams(fields);
	const result = actions.default({
		request: { formData: async () => form },
		locals: { identity: {}, learning: { setStartingLanguage } }
	} as never);
	return { setStartingLanguage, result: Promise.resolve(result) };
}

/** What the action throws or returns: a redirect is thrown by SvelteKit's `redirect`. */
async function outcome(result: Promise<unknown>) {
	try {
		return { returned: await result };
	} catch (thrown) {
		return { thrown };
	}
}

describe('the starting-Language action', () => {
	it.each([
		['no language', { next: '/problems/stacks-push' }],
		['a value that is not a Language', { language: 'rust', next: '/problems/stacks-push' }]
	])('answers 400 and stores nothing for %s', async (_name, fields) => {
		const { setStartingLanguage, result } = run(fields);
		const { returned } = await outcome(result);

		expect(returned).toMatchObject({
			status: 400,
			data: { message: 'Choose a Language to continue.', next: '/problems/stacks-push' }
		});
		expect(setStartingLanguage).not.toHaveBeenCalled();
	});

	it('stores the choice once, then goes to next', async () => {
		const { setStartingLanguage, result } = run({
			language: 'go',
			next: '/problems/stacks-push?tab=hints'
		});
		const { thrown } = await outcome(result);

		expect(setStartingLanguage).toHaveBeenCalledTimes(1);
		expect(setStartingLanguage).toHaveBeenCalledWith('go');
		expect(thrown).toMatchObject({ status: 303, location: '/problems/stacks-push?tab=hints' });
	});

	it.each([
		['//evil.example/x', { next: '//evil.example/x' }],
		['an absolute address', { next: 'https://evil.example/' }],
		['a backslash path', { next: '/\\evil.example' }],
		['no next', {}]
	])('goes home when next is %s', async (_name, extra) => {
		const { setStartingLanguage, result } = run({ language: 'go', ...extra });
		const { thrown } = await outcome(result);

		expect(setStartingLanguage).toHaveBeenCalledWith('go');
		expect(thrown).toMatchObject({ status: 303, location: '/' });
	});

	it('hands a refused page a safe next, not the raw one', async () => {
		const { result } = run({ next: '//evil.example/x' });
		const { returned } = await outcome(result);

		expect(returned).toMatchObject({ status: 400, data: { next: '/' } });
	});
});

describe('the starting-Language load', () => {
	it('returns next through the same check, and reads no Learner', async () => {
		const at = (query: string) =>
			load({ url: new URL(`http://localhost/language${query}`), locals: {} } as never);

		expect(await at('?next=/problems/stacks-push')).toEqual({ next: '/problems/stacks-push' });
		expect(await at('?next=//evil.example')).toEqual({ next: '/' });
		expect(await at('')).toEqual({ next: '/' });
	});
});
