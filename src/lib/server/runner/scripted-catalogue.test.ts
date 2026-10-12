import { beforeAll, describe, expect, it } from 'vitest';
import { type Catalogue, loadCatalogue } from '../content/catalogue.ts';
import type { ExecuteRequest, Files } from './port.ts';
import { createCatalogueScriptedRunner } from './scripted-catalogue.ts';

let catalogue: Catalogue;
const problemOf = (id: string) => {
	const problem = catalogue.problem(id);
	if (!problem) throw new Error(`no fixture Problem ${id}`);
	return problem;
};
const hiddenOf = (id: string) => catalogue.hiddenTests(id) ?? [];
beforeAll(async () => {
	catalogue = await loadCatalogue('src/lib/server/content/fixture');
});

const push = 'stacks-push';

function requestFor(
	problemId: string,
	files: Files,
	language: ExecuteRequest['language'] = 'python'
) {
	const problem = problemOf(problemId);
	return {
		language,
		files,
		tests: [...problem.exampleTests, ...hiddenOf(problemId)].map(({ id, input }) => ({
			id,
			input
		})),
		limits: { timeoutMs: 1000, memoryMb: 128 }
	} satisfies ExecuteRequest;
}

describe('catalogue scripted runner', () => {
	it('prints each Test its expected output for the Reference Code, in every Language', async () => {
		const runner = createCatalogueScriptedRunner(catalogue);
		for (const language of ['python', 'typescript', 'go'] as const) {
			const files = problemOf(push).referenceCode[language];
			const request = requestFor(push, { ...files }, language);

			const { results, compileError } = await runner.execute(request);

			expect(compileError).toBeUndefined();
			const expected = [...problemOf(push).exampleTests, ...hiddenOf(push)];
			expect(results.map((r) => [r.id, r.status, r.stdout])).toEqual(
				expected.map((t) => [t.id, 'ok', t.expected])
			);
		}
	});

	it('prints a literal for code that only prints it', async () => {
		const { results } = await createCatalogueScriptedRunner(catalogue).execute(
			requestFor(push, { 'main.py': 'print(99)\n' })
		);

		expect(results.every((r) => r.status === 'ok' && r.stdout === '99\n')).toBe(true);
	});

	it('reports a runtime error for code that raises', async () => {
		const { results } = await createCatalogueScriptedRunner(catalogue).execute(
			requestFor(push, { 'main.py': 'raise ValueError("boom")\n' })
		);

		expect(
			results.every((r) => r.status === 'runtimeError' && r.stderr.includes('ValueError: boom'))
		).toBe(true);
	});

	it('reports a compile error for a syntax error', async () => {
		const result = await createCatalogueScriptedRunner(catalogue).execute(
			requestFor(push, { 'main.py': 'def (:\n' })
		);

		expect(result.compileError).toContain('SyntaxError');
		expect(result.results).toEqual([]);
	});

	it('is ok with empty output for any other code', async () => {
		const { results } = await createCatalogueScriptedRunner(catalogue).execute(
			requestFor(push, { 'main.py': '# my python build\n' })
		);

		expect(results.every((r) => r.status === 'ok' && r.stdout === '')).toBe(true);
	});

	it("lets a later Problem's Reference Code pass the earlier Core Problems, not the other way round", async () => {
		const runner = createCatalogueScriptedRunner(catalogue);
		const tests = (ids: string[]) =>
			ids.flatMap((id) => [...problemOf(id).exampleTests]).map(({ id, input }) => ({ id, input }));
		const request = (reference: string) => ({
			...requestFor(push, { ...problemOf(reference).referenceCode.python }),
			tests: tests([push, 'stacks-pop'])
		});

		const fromPop = await runner.execute(request('stacks-pop'));
		const fromPush = await runner.execute(request(push));

		const outputs = (r: typeof fromPop) => r.results.map(({ id, stdout }) => [id, stdout]);
		const all = [...problemOf(push).exampleTests, ...problemOf('stacks-pop').exampleTests];
		expect(outputs(fromPop)).toEqual(all.map((t) => [t.id, t.expected]));
		expect(outputs(fromPush)).toEqual(
			all.map((t) => [t.id, t.id.startsWith(push) ? t.expected : ''])
		);
	});
});
