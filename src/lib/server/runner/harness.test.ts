import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../languages';
import { harnessScript } from './harness';

/** sha256 of harness.py. A change to the harness updates this constant on purpose. */
const harnessSha256 = 'b10030ec831226c8dcffb57c7565c8401398b7f179019ad1bfd0276032812e8d';

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

const harnessBytes = readFileSync(new URL('./harness.py', import.meta.url));
const harnessUnchanged = createHash('sha256').update(harnessBytes).digest('hex') === harnessSha256;
const changedMessage =
	'harness.py changed: check its top level still runs nothing, then update harnessSha256';

describe('harness.py', () => {
	it('is the harness this file was written against: a change updates harnessSha256 on purpose', () => {
		expect(harnessUnchanged, changedMessage).toBe(true);
	});
});

// harness.py's rules run through the host's python3 (3.12 or later), never skipped: a host without
// it fails here. -B writes no __pycache__, -I ignores the environment and the working directory.
// One process loads harness.py (importing it runs nothing) and answers every row.
const harnessPath = fileURLToPath(new URL('./harness.py', import.meta.url));
const driver = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("harness", sys.argv[1])
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
rows = json.load(sys.stdin)
out = []
for language, code, stdout, stderr in rows:
    r = h.classify_compile(language, code, stdout.encode(), stderr.encode())
    out.append(None if r is None else r.decode())
print(json.dumps({"classified": out, "languages": {k: [v["entry"], v["ext"]] for k, v in h.LANGUAGES.items()}}))
`;

type Row = {
	name: string;
	language: string;
	code: number;
	stdout?: string;
	stderr?: string;
	/** The Compile Error shown to the Learner, or null where the failure is the Runner's. */
	compileError: 'diagnostics' | null;
};

const goHeader = '# solution\n';
const rows: Row[] = [
	// Python: py_compile exits 1 with an exception line on stderr.
	{
		name: 'python: a syntax error',
		language: 'python',
		code: 1,
		stderr:
			'  File "/work/build/main.py", line 1\n    def (:\n        ^\nSyntaxError: invalid syntax\n',
		compileError: 'diagnostics'
	},
	{
		name: 'python: a null byte in the source',
		language: 'python',
		code: 1,
		stderr: 'SyntaxError: source code string cannot contain null bytes\n',
		compileError: 'diagnostics'
	},
	{
		name: 'python: bad indentation',
		language: 'python',
		code: 1,
		stderr: 'Sorry: IndentationError: unexpected indent (main.py, line 2)\n',
		compileError: 'diagnostics'
	},
	{
		name: 'python: mixed tabs and spaces',
		language: 'python',
		code: 1,
		stderr:
			'Sorry: TabError: inconsistent use of tabs and spaces in indentation (main.py, line 3)\n',
		compileError: 'diagnostics'
	},
	{
		name: "python: another exit code is the Runner's",
		language: 'python',
		code: 2,
		stderr: 'SyntaxError: invalid syntax\n',
		compileError: null
	},
	{
		name: "python: an exit 1 matching no rule is the Runner's",
		language: 'python',
		code: 1,
		stderr: 'MemoryError\n',
		compileError: null
	},
	{
		name: "python: a killed compiler is the Runner's",
		language: 'python',
		code: -9,
		stderr: '',
		compileError: null
	},
	// TypeScript: tsc exits 2 with "error TS<n>" diagnostics on stdout.
	{
		name: 'typescript: a type error',
		language: 'typescript',
		code: 2,
		stdout: "main.ts(1,5): error TS2322: Type 'string' is not assignable to type 'number'.\n",
		compileError: 'diagnostics'
	},
	{
		name: 'typescript: an enum, which Node cannot strip',
		language: 'typescript',
		code: 2,
		stdout:
			"main.ts(1,6): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.\n",
		compileError: 'diagnostics'
	},
	{
		name: 'typescript: a syntax error',
		language: 'typescript',
		code: 2,
		stdout: 'main.ts(1,7): error TS1109: Expression expected.\n',
		compileError: 'diagnostics'
	},
	{
		name: 'typescript: a type error beside a learner tsconfig.json',
		language: 'typescript',
		code: 2,
		stdout: "main.ts(1,5): error TS2322: Type 'string' is not assignable to type 'number'.\n",
		compileError: 'diagnostics'
	},
	{
		name: 'typescript: a strict-check error beside a permissive tsconfig.json',
		language: 'typescript',
		code: 2,
		stdout: "main.ts(1,5): error TS2322: Type 'null' is not assignable to type 'string'.\n",
		compileError: 'diagnostics'
	},
	{
		name: "typescript: exit 1 (a bad option) is the Runner's",
		language: 'typescript',
		code: 1,
		stdout: "error TS5023: Unknown compiler option '--nope'.\n",
		compileError: null
	},
	{
		name: "typescript: exit 2 with no diagnostic is the Runner's",
		language: 'typescript',
		code: 2,
		stdout: 'something else\n',
		compileError: null
	},
	{
		name: "typescript: diagnostics on stderr only are the Runner's",
		language: 'typescript',
		code: 2,
		stderr: 'main.ts(1,5): error TS2322: x\n',
		compileError: null
	},
	{
		name: "typescript: a killed compiler is the Runner's",
		language: 'typescript',
		code: -9,
		compileError: null
	},
	// Go: go build exits 1 for every failure; stderr tells the Learner's mistakes from the toolchain's.
	{
		name: 'go: an unused import (file:line:col diagnostic)',
		language: 'go',
		code: 1,
		stderr: `${goHeader}./main.go:3:8: "os" imported and not used\n`,
		compileError: 'diagnostics'
	},
	{
		name: 'go: a missing func main, from the linker',
		language: 'go',
		code: 1,
		stderr: `${goHeader}runtime.main_main·f: function main is undeclared in the main package\n`,
		compileError: 'diagnostics'
	},
	{
		name: 'go: a package that is not main',
		language: 'go',
		code: 1,
		stderr: '-buildmode=exe requires exactly one main package\n',
		compileError: 'diagnostics'
	},
	{
		name: 'go: a Build that mixes packages',
		language: 'go',
		code: 1,
		stderr: 'found packages main (main.go) and other (other.go) in /work/gomod\n',
		compileError: 'diagnostics'
	},
	{
		name: 'go: a cgo-only file, since cgo is off',
		language: 'go',
		code: 1,
		stderr: 'package solution: build constraints exclude all Go files in /work/gomod\n',
		compileError: 'diagnostics'
	},
	{
		name: 'go: an import it cannot fetch, since the Sandbox has no network',
		language: 'go',
		code: 1,
		stderr:
			'main.go:3:8: no required module provides package github.com/x/y; to add it:\n\tgo get github.com/x/y\n',
		compileError: 'diagnostics'
	},
	{
		name: "go: another exit code is the Runner's",
		language: 'go',
		code: 2,
		stderr: './main.go:3:8: x\n',
		compileError: null
	},
	{
		name: "go: an exit 1 matching no rule (no space left) is the Runner's",
		language: 'go',
		code: 1,
		stderr: 'go: writing stat cache: no space left on device\n',
		compileError: null
	},
	{
		name: "go: a killed compiler is the Runner's",
		language: 'go',
		code: 1,
		stderr: '# solution\n/usr/local/go/pkg/tool/linux_amd64/compile: signal: killed\n',
		compileError: null
	}
];

// Python runs harness.py only when it is the file this test was written against: loading it executes
// its top level, so an unreviewed change must never run here.
const python = harnessUnchanged
	? spawnSync('python3', ['-B', '-I', '-c', driver, harnessPath], {
			input: JSON.stringify(rows.map((r) => [r.language, r.code, r.stdout ?? '', r.stderr ?? ''])),
			encoding: 'utf8',
			timeout: 30_000
		})
	: undefined;
const version = spawnSync(
	'python3',
	['-B', '-I', '-c', 'import sys; print(sys.version_info[0]*100+sys.version_info[1])'],
	{
		encoding: 'utf8'
	}
);
const reported = python?.status === 0 ? JSON.parse(python.stdout) : undefined;

describe('harness.py through the host python3', () => {
	it('has python3, 3.12 or later, and loads harness.py', () => {
		expect(version.error, 'python3 is required on the host').toBeUndefined();
		expect(Number(version.stdout)).toBeGreaterThanOrEqual(312);
		expect(harnessUnchanged, changedMessage).toBe(true);
		expect(python?.stderr).toBe('');
		expect(reported).toBeDefined();
	});

	it('has a row for every Language and both outcomes', () => {
		for (const { id } of LANGUAGES) {
			expect(rows.some((r) => r.language === id && r.compileError === 'diagnostics')).toBe(true);
			expect(rows.some((r) => r.language === id && r.compileError === null)).toBe(true);
		}
	});

	it.each(rows.map((r, i) => [r.name, r, i] as const))('classifies %s', (_name, row, i) => {
		expect(harnessUnchanged, changedMessage).toBe(true);
		const got: string | null = reported.classified[i];
		if (row.compileError === null) expect(got).toBeNull();
		else expect(got).toBe(row.language === 'typescript' ? row.stdout : row.stderr);
	});

	it('has exactly the Languages of languages.ts, with the same entry file and extension', () => {
		expect(harnessUnchanged, changedMessage).toBe(true);
		expect(Object.keys(reported.languages).sort()).toEqual(LANGUAGES.map((l) => l.id).sort());
		for (const l of LANGUAGES) {
			expect(reported.languages[l.id], l.id).toEqual([l.entryFile, l.extension]);
		}
	});
});
