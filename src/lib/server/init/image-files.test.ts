import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runInit } from './init.ts';

// The image runs several roles from source (docker-entrypoint.sh). The Dockerfile copies
// src/lib/server whole, so this test only checks the entry points: each one exists and its
// source is copied into the final stage.

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

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

const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
const entries = entryFiles(readFileSync(join(ROOT, 'docker-entrypoint.sh'), 'utf8'));

describe('the image copies every entry it runs from source', () => {
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

	it('has every entry on disk and copied by the final stage', () => {
		const sources = copiedSources(dockerfile);
		for (const entry of entries) {
			expect(existsSync(join(ROOT, entry)), `${entry} exists`).toBe(true);
			expect(isCopied(entry, sources), `${entry} is copied`).toBe(true);
		}
	});

	it('names the entry when the COPY is missing', () => {
		const without = dockerfile.replace('COPY src/lib/server ./src/lib/server', '');
		expect(without).not.toBe(dockerfile);
		const sources = copiedSources(without);
		expect(entries.filter((e) => !isCopied(e, sources))).toContain('src/lib/server/web-entry.ts');
	});
});

describe('the image and its files leave dev mode off', () => {
	it('does not name DEV_MODE in the Dockerfile, the compose.yaml or the .env that init writes', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-image-'));
		try {
			await runInit(['--origin', 'https://learn.example.com/'], dir);
			const written = {
				Dockerfile: dockerfile,
				'compose.yaml': readFileSync(join(dir, 'compose.yaml'), 'utf8'),
				'.env': readFileSync(join(dir, '.env'), 'utf8')
			};
			for (const [name, text] of Object.entries(written)) {
				expect(text.length, `${name} was read`).toBeGreaterThan(100);
				expect(text, `${name} must not set or name DEV_MODE`).not.toContain('DEV_MODE');
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
