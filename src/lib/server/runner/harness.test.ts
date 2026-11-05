import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { harnessScript } from './harness';

describe('harnessScript', () => {
	it('is the Python in harness.py, with no TypeScript string left in harness.ts', () => {
		const py = readFileSync(new URL('./harness.py', import.meta.url), 'utf8');
		expect(harnessScript).toBe(py);
		expect(readFileSync(new URL('./harness.ts', import.meta.url), 'utf8')).not.toContain(
			'String.raw'
		);
	});

	it('is a complete script that names harness.ts as its protocol and ends with a newline', () => {
		expect(
			harnessScript.startsWith('# The protocol this script speaks is described in harness.ts.\n')
		).toBe(true);
		expect(harnessScript).toContain('run_tests()');
		expect(harnessScript.endsWith('\n')).toBe(true);
	});
});
