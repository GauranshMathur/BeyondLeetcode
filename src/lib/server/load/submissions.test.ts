import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { LANGUAGE_IDS } from '../../languages';
import { type Catalogue, loadCatalogue } from '../content/catalogue';
import { sandboxConfig } from '../runner/config';
import { runnerSubmissions } from './submissions';

const fixtureDir = fileURLToPath(new URL('../content/fixture', import.meta.url));
let catalogue: Catalogue;

beforeAll(async () => {
	catalogue = await loadCatalogue(fixtureDir);
});

const contentOrder = (c: Catalogue) =>
	c
		.topicMap()
		.flatMap((t) => (c.topic(t.id)?.chapters ?? []).flatMap((ch) => ch.problems.map((p) => p.id)));

describe('load submissions', () => {
	it('has one entry per Problem per Language in content order, with the Reference Code as files', () => {
		const { submissions } = runnerSubmissions(catalogue);

		const expected = contentOrder(catalogue).flatMap((problemId) =>
			LANGUAGE_IDS.map((language) => ({ problemId, language }))
		);
		expect(submissions.map(({ problemId, language }) => ({ problemId, language }))).toEqual(
			expected
		);
		expect(expected.length).toBeGreaterThan(0);
		for (const { problemId, language, calls } of submissions) {
			const reference = catalogue.problem(problemId)?.referenceCode[language];
			expect(calls.length).toBeGreaterThan(0);
			for (const call of calls) expect(call.files).toEqual(reference);
		}
	});

	it('sends the Example Tests alone, then the earlier Problems and the Hidden Tests in batches', () => {
		const { submissions } = runnerSubmissions(catalogue, 1);

		const entry = submissions.find((s) => s.problemId === 'stacks-pop' && s.language === 'python');
		const ids = entry?.calls.map((c) => c.tests.map((t) => t.id));
		const examples = (id: string) => catalogue.problem(id)?.exampleTests.map((t) => t.id);
		const hidden = (id: string) => catalogue.hiddenTests(id)?.map((t) => t.id);
		expect(ids).toEqual([
			examples('stacks-pop'),
			...(examples('stacks-push') ?? []).map((t) => [t]),
			...(hidden('stacks-push') ?? []).map((t) => [t]),
			...(hidden('stacks-pop') ?? []).map((t) => [t])
		]);
		expect(ids).toHaveLength(4);
	});

	it('keeps every entry within the most calls a Submission may make at the default size', () => {
		for (const { calls } of runnerSubmissions(catalogue).submissions) {
			expect(calls.length).toBeLessThanOrEqual(sandboxConfig.maxSubmitCalls);
		}
	});

	it('builds requests of exactly language, files, tests and limits, with no expected output', () => {
		for (const { calls } of runnerSubmissions(catalogue).submissions) {
			for (const call of calls) {
				expect(Object.keys(call).sort()).toEqual(['files', 'language', 'limits', 'tests']);
				expect(call.limits).toEqual({
					timeoutMs: sandboxConfig.testTimeoutMs,
					memoryMb: sandboxConfig.memoryMb
				});
				for (const test of call.tests) expect(Object.keys(test).sort()).toEqual(['id', 'input']);
			}
		}
	});

	it('reads the queue limits from the sandbox config', () => {
		const { maxQueued, queueWaitMs } = runnerSubmissions(catalogue);

		expect({ maxQueued, queueWaitMs }).toEqual({
			maxQueued: sandboxConfig.maxQueued,
			queueWaitMs: sandboxConfig.queueWaitMs
		});
	});
});
