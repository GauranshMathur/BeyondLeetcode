import { describe, expect, it, vi } from 'vitest';
import { LearningError } from '#lib/server/learning/errors.js';
import { actions } from './+page.server';

// The dev-mode action runs a Problem's Reference Code. It reads the Instance's own switch before it reads
// anything the request carries, and passes the core exactly two values.

function toForm(fields: Record<string, string | File>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return form;
}

function call(options: {
	devMode: unknown;
	fields?: Record<string, string | File>;
	headers?: Record<string, string>;
	search?: string;
	runReference?: ReturnType<typeof vi.fn>;
}) {
	const runReference = options.runReference ?? vi.fn(async () => ({ tests: [] }));
	const formData = vi.fn(async () => toForm(options.fields ?? {}));
	const event = {
		locals: { devMode: options.devMode, identity: {}, learning: { runReference } },
		params: { problemId: 'stacks-push' },
		url: new URL(`http://localhost/problems/stacks-push${options.search ?? ''}`),
		request: { formData, headers: new Headers(options.headers) }
	};
	const result = Promise.resolve().then(() => actions.runReference(event as never));
	return { result, runReference, formData };
}

const refusalOf = async (result: Promise<unknown>) =>
	result.then(
		() => undefined,
		(e: { status: number; body: { message: string; revision?: number } }) => e
	);

// The default-server e2e cannot catch the removal of this route's own check: with dev mode off the core's
// runReference refuses with NotFound too, so the page answers 404 either way. This unit test is the guard.
describe('the runReference action with dev mode off', () => {
	it.each([1, '1', 'true', {}])(
		'treats %j, which is not the boolean true, as off',
		async (devMode) => {
			const { result, runReference, formData } = call({ devMode, fields: { language: 'python' } });

			expect(await refusalOf(result)).toMatchObject({ status: 404, body: { message: 'NotFound' } });
			expect(runReference).not.toHaveBeenCalled();
			expect(formData).not.toHaveBeenCalled();
		}
	);

	it('answers 404 without calling the core or reading the body', async () => {
		const { result, runReference, formData } = call({
			devMode: false,
			fields: { language: 'python' }
		});

		expect(await refusalOf(result)).toMatchObject({ status: 404, body: { message: 'NotFound' } });
		expect(runReference).not.toHaveBeenCalled();
		expect(formData).not.toHaveBeenCalled();
	});

	it('ignores every way a request might ask for dev mode', async () => {
		const { result, runReference } = call({
			devMode: false,
			fields: { language: 'python', devMode: '1', DEV_MODE: '1' },
			headers: { 'x-dev-mode': '1', cookie: 'DEV_MODE=1' },
			search: '?devMode=1'
		});

		expect(await refusalOf(result)).toMatchObject({ status: 404, body: { message: 'NotFound' } });
		expect(runReference).not.toHaveBeenCalled();
	});
});

describe('the runReference action with dev mode on', () => {
	it.each([
		['missing', undefined],
		['empty', ''],
		['java', 'java'],
		['capitalised', 'Python'],
		['padded', ' python'],
		['toString', 'toString'],
		['__proto__', '__proto__']
	])('refuses a language that is %s with BadRequest', async (_name, language) => {
		const { result, runReference } = call({
			devMode: true,
			fields: language === undefined ? {} : { language }
		});

		expect(await refusalOf(result)).toMatchObject({ status: 400, body: { message: 'BadRequest' } });
		expect(runReference).not.toHaveBeenCalled();
	});

	it('refuses a language sent as a file with BadRequest', async () => {
		const { result, runReference } = call({
			devMode: true,
			fields: { language: new File(['python'], 'python') }
		});

		expect(await refusalOf(result)).toMatchObject({ status: 400, body: { message: 'BadRequest' } });
		expect(runReference).not.toHaveBeenCalled();
	});

	it('passes the route Problem and the checked Language, and nothing else, and answers unchanged', async () => {
		const answer = {
			tests: [{ problemId: 'stacks-push', name: '01', kind: 'example', status: 'passed' }]
		};
		const runReference = vi.fn(async () => answer);
		const { result } = call({
			devMode: true,
			fields: { language: 'go', problemId: 'heaps-insert', files: '{}', build: '{}' },
			runReference
		});

		expect(await result).toBe(answer);
		expect(runReference).toHaveBeenCalledTimes(1);
		expect(runReference.mock.calls[0]).toEqual(['stacks-push', 'go']);
	});

	it('answers a Runner outage with 503 and no revision', async () => {
		const runReference = vi.fn(async () => {
			throw new LearningError('RunnerUnavailable');
		});
		const refusal = await refusalOf(
			call({ devMode: true, fields: { language: 'python' }, runReference }).result
		);

		expect(refusal).toMatchObject({ status: 503, body: { message: 'RunnerUnavailable' } });
		expect(refusal?.body).not.toHaveProperty('revision');
	});

	it('answers a Problem the core does not know with 404', async () => {
		const runReference = vi.fn(async () => {
			throw new LearningError('NotFound');
		});
		const refusal = await refusalOf(
			call({ devMode: true, fields: { language: 'python' }, runReference }).result
		);

		expect(refusal).toMatchObject({ status: 404, body: { message: 'NotFound' } });
	});
});
