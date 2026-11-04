import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	ANYWHERE,
	breakpointProblems,
	PHONE,
	PROBLEM_MIDDLE,
	PROBLEM_WIDE,
	TIED
} from './breakpoints';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function styleFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return styleFiles(path);
		return /\.(svelte|css)$/.test(name) ? [relative(root, path)] : [];
	});
}

describe('the media queries', () => {
	it('every @media in src is a named breakpoint, inside its files', () => {
		const problems = styleFiles(join(root, 'src')).flatMap((file) =>
			breakpointProblems(file, readFileSync(join(root, file), 'utf8'))
		);
		expect(problems).toEqual([]);
	});

	it('refuses a screen that writes 768px', () => {
		expect(
			breakpointProblems(
				'src/routes/x/+page.svelte',
				'<style>@media (max-width: 768px) { a {} }</style>'
			)
		).toEqual(['src/routes/x/+page.svelte: "(max-width: 768px)" is not a named breakpoint']);
	});

	it('refuses a tied query outside its files', () => {
		expect(
			breakpointProblems('src/routes/x/+page.svelte', '@media (max-width: 900px) { a {} }')
		).toHaveLength(1);
	});

	it('accepts the phone query anywhere, alone or in a comma list of named queries', () => {
		const file = 'src/routes/problems/[problemId]/+page.svelte';
		expect(breakpointProblems('src/routes/x/+page.svelte', `@media ${PHONE} {`)).toEqual([]);
		expect(breakpointProblems(file, '@media (width > 900px), (max-width: 767.98px) {')).toEqual([]);
		expect(
			breakpointProblems(
				'src/routes/x/+page.svelte',
				'@media (width > 900px), (max-width: 767.98px) {'
			)
		).toHaveLength(1);
	});

	it('every named query is used by each file it is tied to, or at least one', () => {
		const sources = styleFiles(join(root, 'src'))
			.map((f) => readFileSync(join(root, f), 'utf8'))
			.join('\n');
		for (const query of [...ANYWHERE, ...Object.keys(TIED)])
			expect(sources, query).toContain(query);
	});
});

describe('the Problem screen breakpoints', () => {
	it('the phone and middle layouts meet at 767.98px', () => {
		expect(PHONE).toBe('(max-width: 767.98px)');
		expect(PROBLEM_MIDDLE).toBe('(width > 767.98px) and (width <= 900px)');
	});

	it('the middle and wide layouts meet at 900px', () => {
		expect(PROBLEM_MIDDLE).toContain('(width <= 900px)');
		expect(PROBLEM_WIDE).toBe('(width > 900px)');
	});

	it('the Problem files use the middle and wide queries and no 901px or min-width: 90x', () => {
		for (const file of TIED[PROBLEM_WIDE]) {
			const css = readFileSync(join(root, file), 'utf8');
			expect(css).not.toContain('901px');
			expect(css).not.toMatch(/min-width:\s*90\d/);
			expect(css, file).toContain(PROBLEM_WIDE);
		}
		expect(
			readFileSync(join(root, 'src/routes/problems/[problemId]/ProblemWorkspace.svelte'), 'utf8')
		).toContain(PROBLEM_MIDDLE);
	});
});
