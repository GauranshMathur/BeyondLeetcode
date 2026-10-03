import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The web role never reaches the Docker socket: only the allow-listed runner modules may be imported
 * outside the runner module, and nothing may name the socket. (The compose-level check belongs to the deploy card.)
 */

const srcRoot = join(import.meta.dirname, '..', '..', '..');
const runnerDir = join(srcRoot, 'lib', 'server', 'runner');

/** The only runner modules the web role may import (`config` is constants: Sandbox limits). */
const allowed = new Set(['http-adapter', 'port', 'fake', 'contract', 'config']);

/** Names the socket on purpose: asserts the compose file keeps it away from the web role. */
const namesSocketOnPurpose = new Set(['lib/server/init/init.test.ts']);

/** Why a file outside the runner module breaks the web role's isolation, if it does. */
function isolationViolations(source: string): string[] {
	const found: string[] = [];
	if (source.includes('docker.sock')) found.push('docker.sock');
	const specifier = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;
	for (const match of source.matchAll(specifier)) {
		const module = /(?:^|\/)runner\/([^/]+?)(?:\.[cm]?[jt]s)?$/.exec(match[1]);
		if (module && !allowed.has(module[1])) found.push(match[1]);
	}
	return found;
}

function* sourceFiles(dir: string): Generator<string> {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			if (path !== runnerDir) yield* sourceFiles(path);
		} else if (/\.(?:[cm]?[jt]s|svelte)$/.test(name)) {
			yield path;
		}
	}
}

describe('isolationViolations', () => {
	it('flags imports of any runner module outside the allow-list, in any import form', () => {
		for (const line of [
			"import { createEngine } from '$lib/server/runner/engine';",
			"import { containerSpec } from '$lib/server/runner/sandbox.ts';",
			"import('../runner/engine.js')",
			"const e = require('./runner/sandbox')",
			"export * from '../../lib/server/runner/engine';",
			"import { main } from '$lib/server/runner/main';",
			"import { c } from '$lib/server/runner/migrate';"
		]) {
			expect(isolationViolations(line), line).not.toEqual([]);
		}
	});

	it('flags the Docker socket path', () => {
		expect(isolationViolations("const s = '/var/run/docker.sock';")).toEqual(['docker.sock']);
	});

	it('allows what the web role may use of the runner module', () => {
		for (const line of [
			"import { createHttpRunner } from '$lib/server/runner/http-adapter';",
			"import type { RunnerPort } from '$lib/server/runner/port';",
			"import { createFakeRunner } from '$lib/server/runner/fake';",
			"import { x } from './engine';"
		]) {
			expect(isolationViolations(line), line).toEqual([]);
		}
	});
});

describe('the web role', () => {
	it('never imports the Runner engine or sandbox, nor names the Docker socket', () => {
		const files = [...sourceFiles(srcRoot)];
		const offenders = files.flatMap((file) => {
			const name = relative(srcRoot, file).split(sep).join('/');
			return isolationViolations(readFileSync(file, 'utf8'))
				.filter((why) => !(why === 'docker.sock' && namesSocketOnPurpose.has(name)))
				.map((why) => `${name}: ${why}`);
		});

		expect(files.length).toBeGreaterThan(0);
		expect(offenders).toEqual([]);
	});
});
