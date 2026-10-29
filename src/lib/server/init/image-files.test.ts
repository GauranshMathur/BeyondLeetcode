import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The image runs several roles from source (docker-entrypoint.sh) and copies a hand-kept list of
// files into its final stage. This test walks the static imports of each from-source entry and
// names any reached file under src/ that the final stage does not copy.

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SRC = join(ROOT, 'src');
const EXTENSIONS = ['', '.ts', '.js', '.svelte.ts', '/index.ts', '/index.js'];

/** The files `bun <file>` runs in docker-entrypoint.sh. */
function entryFiles(entrypointText: string): string[] {
	const found = new Set<string>();
	for (const match of entrypointText.matchAll(/\bbun\s+(src\/[^\s"']+\.ts)/g)) found.add(match[1]);
	return [...found];
}

/** Sources of the COPY lines in the Dockerfile's final stage, relative to the repo root. */
function copiedSources(dockerfileText: string): string[] {
	const lines = dockerfileText.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
	let lastFrom = 0;
	lines.forEach((line, i) => {
		if (/^\s*FROM\s/i.test(line)) lastFrom = i;
	});
	const sources: string[] = [];
	for (const line of lines.slice(lastFrom)) {
		if (!/^\s*COPY\s/i.test(line)) continue;
		const args = line.trim().split(/\s+/).slice(1);
		if (args.some((a) => a.startsWith('--from'))) continue;
		const paths = args.filter((a) => !a.startsWith('--'));
		for (const source of paths.slice(0, -1)) {
			sources.push(source.replace(/^\.\//, '').replace(/\/+$/, ''));
		}
	}
	return sources;
}

function isCopied(file: string, sources: string[]): boolean {
	return sources.some((s) => s === '.' || s === file || file.startsWith(`${s}/`));
}

function specifiersOf(source: string): string[] {
	const specs: string[] = [];
	for (const m of source.matchAll(
		/^[ \t]*(?:import|export)\s+([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/gm
	)) {
		const clause = m[1];
		if (/^type\s/.test(clause)) continue;
		const named = clause.match(/^\{([^}]*)\}$/);
		if (named) {
			const names = named[1]
				.split(',')
				.map((n) => n.trim())
				.filter(Boolean);
			if (names.length > 0 && names.every((n) => /^type\s/.test(n))) continue;
		}
		specs.push(m[2]);
	}
	for (const m of source.matchAll(/^[ \t]*import\s*['"]([^'"]+)['"]/gm)) specs.push(m[1]);
	for (const m of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
	return specs;
}

function resolveSpecifier(spec: string, fromFile: string): string | undefined {
	let base: string;
	if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
	else if (spec.startsWith('$lib/') || spec.startsWith('#lib/'))
		base = join(SRC, 'lib', spec.slice(5));
	else return undefined; // node: and bare package names come from node_modules
	const candidates = [base, base.replace(/\.js$/, '.ts')];
	for (const candidate of candidates) {
		for (const ext of EXTENSIONS) {
			const path = candidate + ext;
			if (existsSync(path) && statSync(path).isFile()) return path;
		}
	}
	return undefined;
}

/** Every file under src/ reachable from the entries through runtime imports (entries included). */
function reachable(entries: string[]): string[] {
	const seen = new Set<string>();
	const queue = entries.map((e) => resolve(ROOT, e));
	while (queue.length > 0) {
		const file = queue.pop() as string;
		if (seen.has(file)) continue;
		seen.add(file);
		for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
			const target = resolveSpecifier(spec, file);
			if (target?.startsWith(`${SRC}/`) && !seen.has(target)) queue.push(target);
		}
	}
	return [...seen].map((f) => relative(ROOT, f)).sort();
}

/** The reached files the Dockerfile's final stage does not copy. */
function uncopied(entries: string[], dockerfileText: string): string[] {
	const sources = copiedSources(dockerfileText);
	return reachable(entries).filter((f) => !isCopied(f, sources));
}

const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
const entries = entryFiles(readFileSync(join(ROOT, 'docker-entrypoint.sh'), 'utf8'));

describe('the image copies every module it runs from source', () => {
	it('reads the from-source entries from docker-entrypoint.sh', () => {
		expect(entries).toEqual(
			expect.arrayContaining([
				'src/lib/server/web-entry.ts',
				'src/lib/server/init/reset-admin-password.ts',
				'src/lib/server/runner/main.ts',
				'src/lib/server/init/init.ts'
			])
		);
	});

	it('copies every file those entries reach', () => {
		expect(uncopied(entries, dockerfile)).toEqual([]);
	});

	it('names the file when a COPY is missing', () => {
		const without = dockerfile.replace(' src/lib/server/logging.ts', '');
		expect(without).not.toBe(dockerfile);
		expect(uncopied(entries, without)).toEqual(['src/lib/server/logging.ts']);
	});
});
