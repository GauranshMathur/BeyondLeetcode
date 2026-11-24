import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadCatalogue } from '#lib/server/content/catalogue.js';
import { createLearningCore } from '#lib/server/learning/core.js';
import { createScriptedRunner } from '#lib/server/runner/fake.js';
import { createTestDb } from '#lib/server/test-db.js';
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

describe('what the action refuses or writes', () => {
	it('throws when nobody is resolved, so nothing is written', async () => {
		await expect(
			Promise.resolve(
				actions.default({
					request: { formData: async () => new URLSearchParams({ language: 'go' }) },
					locals: {}
				} as never)
			)
		).rejects.toThrow('nobody resolved');
	});

	it.each([
		['a file', () => new File(['go'], 'go.txt')],
		['an oversized string', () => 'go'.repeat(100_000)]
	])('answers 400 and stores nothing for %s as the language', async (_name, make) => {
		const setStartingLanguage = vi.fn();
		const form = new FormData();
		form.set('language', make());
		const returned = await actions.default({
			request: { formData: async () => form },
			locals: { identity: {}, learning: { setStartingLanguage } }
		} as never);

		expect(returned).toMatchObject({ status: 400 });
		expect(setStartingLanguage).not.toHaveBeenCalled();
	});

	it('goes to an ASCII-only address when next holds Unicode, keeping its percent escapes', async () => {
		const { result } = run({ language: 'go', next: '/problems/a?q=日本&r=%E6%97%A5 x' });
		const { thrown } = await outcome(result);

		const { location } = thrown as { location: string };
		expect(location).toBe('/problems/a?q=%E6%97%A5%E6%9C%AC&r=%E6%97%A5%20x');
		expect(/^[\u0020-\u007e]*$/.test(location)).toBe(true);
	});

	it('changes only the caller row when two Learners exist', async () => {
		const catalogue = await loadCatalogue(
			fileURLToPath(new URL('../../lib/server/content/fixture', import.meta.url))
		);
		const db = await createTestDb();
		const core = createLearningCore({ catalogue, db, runner: createScriptedRunner({ tests: {} }) });
		await db.learner.createMany({ data: [{ id: 'ann' }, { id: 'bob' }] });
		const { thrown } = await outcome(
			Promise.resolve(
				actions.default({
					request: { formData: async () => new URLSearchParams({ language: 'go' }) },
					locals: { identity: {}, learning: core.forLearner('ann') }
				} as never)
			)
		);

		expect(thrown).toMatchObject({ status: 303 });
		const rows = await db.learner.findMany({ orderBy: { id: 'asc' } });
		expect(rows.map((r) => [r.id, r.startingLanguage])).toEqual([
			['ann', 'go'],
			['bob', null]
		]);
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
