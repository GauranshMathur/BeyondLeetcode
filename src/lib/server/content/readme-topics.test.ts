import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogue } from './catalogue.ts';
import { readmeTopicsTable, replaceBetweenMarkers } from './readme-topics.ts';

const fixtureDir = fileURLToPath(new URL('./fixture', import.meta.url));

describe('readmeTopicsTable', () => {
	it('lists each Topic in map order with its Chapter and Problem counts, then totals', async () => {
		const catalogue = await loadCatalogue(fixtureDir);
		const table = readmeTopicsTable(catalogue).split('\n');

		expect(table[0]).toBe('| # | Topic | Chapters | Problems |');
		expect(table[1]).toBe('|--:|---|--:|--:|');
		expect(table).toHaveLength(2 + 3 + 1);

		const rows = catalogue.topicMap().map((summary, i) => {
			const topic = catalogue.topic(summary.id);
			const problems = topic?.chapters.flatMap((c) => c.problems) ?? [];
			const core = problems.filter((p) => p.kind === 'core').length;
			const extra = problems.length - core;
			return `| ${i + 1} | ${summary.title} | ${topic?.chapters.length} | ${core} + ${extra} |`;
		});
		expect(table.slice(2, 5)).toEqual(rows);
		expect(table[5]).toMatch(/^\| \| \*\*Total\*\* \| \*\*\d+\*\* \| \*\*\d+ \+ \d+\*\* \|$/);
	});
});

describe('replaceBetweenMarkers', () => {
	const doc = 'a\n<!-- topics:start -->\nold\n<!-- topics:end -->\nb\n';

	it('replaces only what sits between the markers', () => {
		expect(replaceBetweenMarkers(doc, 'new')).toBe(
			'a\n<!-- topics:start -->\nnew\n<!-- topics:end -->\nb\n'
		);
	});

	it('is byte-identical when nothing changed', () => {
		expect(replaceBetweenMarkers(doc, 'old')).toBe(doc);
	});

	it('fails loudly when a marker is missing', () => {
		expect(() => replaceBetweenMarkers('a\n<!-- topics:start -->\n', 'x')).toThrow(/topics:end/);
		expect(() => replaceBetweenMarkers('a\n', 'x')).toThrow(/topics:start/);
	});
});
