import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sandboxConfig } from './config';
import { type ContractSubject, type ProgramKind, runnerContract } from './contract';
import { createEngine } from './engine';
import { createHttpRunner } from './http-adapter';
import type { ExecuteRequest, RunnerPort } from './port';
import { containerSpec } from './sandbox';
import { createTar } from './tar';
import { containersOwnedBy, startRunnerProcess, waitUntilHealthy } from './wait-healthy.testutil';

/** Real HTTP adapter, real Runner process (started as `runner` role would), real Docker. */

const token = 'sandbox-test-token-0123456789-abcdef';
const socket = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const engine = createEngine(socket);
let runnerProcess: ChildProcess;
let url: string;
let instanceId: string;
let runner: RunnerPort;

beforeAll(async () => {
	const started = await startRunnerProcess(token, socket);
	runnerProcess = started.process;
	url = started.url;
	instanceId = started.instanceId;
	await waitUntilHealthy(url, token);
	runner = createHttpRunner({ url, token });
	// Pull the image now so the first test does not pay for it.
	for (const image of Object.values(sandboxConfig.images)) {
		await engine.create(image, {}).then((id) => engine.remove(id));
	}
}, 120_000);

afterAll(() => {
	runnerProcess?.kill();
});

const programs: Record<Exclude<ProgramKind, 'unavailable'>, string> = {
	echo: 'import sys\nsys.stdout.write(sys.stdin.read())\n',
	mixed: [
		'import sys',
		'data = sys.stdin.read()',
		'if data == "crash":',
		'    sys.exit(1)',
		'if data == "hang":',
		'    while True:',
		'        pass',
		'sys.stdout.write(data)',
		''
	].join('\n'),
	hang: 'while True:\n    pass\n',
	doesNotCompile: 'def (:\n'
};

const subject: ContractSubject = (kind) =>
	kind === 'unavailable'
		? {
				runner: createHttpRunner({ url: 'http://127.0.0.1:1', token }),
				language: 'python',
				files: { 'main.py': '' }
			}
		: { runner, language: 'python', files: { 'main.py': programs[kind] } };

runnerContract('HTTP adapter + Runner + Docker (python)', subject);

const tsPrograms: Record<Exclude<ProgramKind, 'unavailable'>, string> = {
	echo: "import { readFileSync } from 'node:fs';\nprocess.stdout.write(readFileSync(0, 'utf8'));\n",
	mixed: [
		"import { readFileSync } from 'node:fs';",
		"const data = readFileSync(0, 'utf8');",
		"if (data === 'crash') process.exit(1);",
		"if (data === 'hang') while (true) {}",
		'process.stdout.write(data);',
		''
	].join('\n'),
	hang: 'while (true) {}\n',
	doesNotCompile: 'let = ;\n'
};

runnerContract('HTTP adapter + Runner + Docker (typescript)', (kind) =>
	kind === 'unavailable'
		? {
				runner: createHttpRunner({ url: 'http://127.0.0.1:1', token }),
				language: 'typescript',
				files: { 'main.ts': '' }
			}
		: {
				runner,
				language: 'typescript',
				files: { 'main.ts': tsPrograms[kind] }
			}
);

describe('Runner: typescript in a fresh Sandbox per run', { timeout: 60_000 }, () => {
	const runTs = (files: Record<string, string>, tests = [{ id: 't', input: '' }]) =>
		runner.execute({
			language: 'typescript',
			files,
			tests,
			limits: { timeoutMs: 2000, memoryMb: 256 }
		});

	it('passes a typed program with no warnings on stderr', async () => {
		const result = await runTs({
			'main.ts': "const n: number = Number('2') + 3;\nconsole.log(n);\n"
		});

		expect(result).toEqual({
			results: [{ id: 't', status: 'ok', stdout: '5\n', stderr: '' }]
		});
	});

	it('reports a wrong answer as ok output for the core to compare', async () => {
		const result = await runTs({ 'main.ts': 'console.log(99);\n' });

		expect(result.results[0]).toMatchObject({ status: 'ok', stdout: '99\n' });
	});

	it('reports a thrown error as a runtime error with the message on stderr', async () => {
		const result = await runTs({ 'main.ts': "throw new Error('boom');\n" });

		expect(result.results[0].status).toBe('runtimeError');
		expect(result.results[0].stderr).toContain('boom');
	});

	it('reports a type error as a compile error', async () => {
		const result = await runTs({
			'main.ts': 'let x: number = "hi";\nconsole.log(x);\n'
		});

		expect(result.compileError).toContain('error TS2322');
		expect(result.results).toEqual([]);
	});

	it('reports an enum as a compile error, since Node cannot strip it', async () => {
		const result = await runTs({
			'main.ts': 'enum E { A }\nconsole.log(E.A);\n'
		});

		expect(result.compileError).toContain('error TS1294');
		expect(result.results).toEqual([]);
	});

	it('runs a Build of several files that import each other with extensions', async () => {
		const result = await runTs({
			'main.ts': "import { twice } from './util/helper.ts';\nconsole.log(twice(21));\n",
			'util/helper.ts': 'export const twice = (n: number): number => n * 2;\n'
		});

		expect(result.compileError).toBeUndefined();
		expect(result.results[0]).toMatchObject({ status: 'ok', stdout: '42\n' });
	});

	it('ignores a learner tsconfig.json: the Build still runs with the fixed options', async () => {
		const result = await runTs({
			'main.ts': "const n: number = Number('2') + 3;\nconsole.log(n);\n",
			'tsconfig.json': '{}'
		});

		expect(result.compileError).toBeUndefined();
		expect(result.results[0]).toMatchObject({ status: 'ok', stdout: '5\n' });
	});

	it('still reports a type error as a compile error beside a tsconfig.json', async () => {
		const result = await runTs({
			'main.ts': 'let x: number = "hi";\nconsole.log(x);\n',
			'tsconfig.json': '{}'
		});

		expect(result.compileError).toContain('error TS2322');
		expect(result.results).toEqual([]);
	});

	it('does not let a tsconfig.json loosen the strict checks', async () => {
		const result = await runTs({
			'main.ts': 'let x: string = null;\nconsole.log(x);\n',
			'tsconfig.json': '{"compilerOptions":{"strict":false}}'
		});

		expect(result.compileError).toContain('error TS2322');
		expect(result.results).toEqual([]);
	});

	it('keeps learner code away from the hidden inputs of other Tests', async () => {
		const main = [
			"import { readFileSync, readdirSync, writeFileSync } from 'node:fs';",
			"const data = readFileSync(0, 'utf8');",
			'const seen: string[] = [];',
			'const walk = (dir: string): void => {',
			'  for (const e of readdirSync(dir, { withFileTypes: true })) {',
			"    const p = dir + '/' + e.name;",
			'    if (e.isDirectory()) walk(p);',
			"    else if (p !== '/work/build/main.ts') seen.push(p + ' ' + readFileSync(p, 'utf8'));",
			'  }',
			'};',
			"walk('/work');",
			"for (const w of ['/work/stash', '/work/build/stash']) { try { writeFileSync(w, data); } catch {} }",
			"console.log(seen.join('\\n'));",
			''
		].join('\n');

		const result = await runTs({ 'main.ts': main }, [
			{ id: 'hidden', input: 'SECRET-hidden-input' },
			{ id: 'example', input: 'SECRET-example' }
		]);

		expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok']);
		for (const r of result.results) {
			expect(r.stdout + r.stderr).not.toContain('SECRET');
			expect(r.stdout).toBe('\n');
		}
	});

	it('kills a process a Test left behind, even one that detached', async () => {
		const main = [
			"import { spawn } from 'node:child_process';",
			"import { readFileSync, existsSync } from 'node:fs';",
			"if (readFileSync(0, 'utf8') === 'first') {",
			"  spawn('sh', ['-c', 'sleep 1; echo alive > /work/survivor'], { detached: true, stdio: 'ignore' }).unref();",
			'} else {',
			"  setTimeout(() => console.log(existsSync('/work/survivor')), 1500);",
			'}',
			''
		].join('\n');

		const result = await runTs({ 'main.ts': main }, [
			{ id: 'first', input: 'first' },
			{ id: 'second', input: 'second' }
		]);

		expect(result.results[1]).toMatchObject({
			status: 'ok',
			stdout: 'false\n'
		});
	});
});

const goPrograms: Record<Exclude<ProgramKind, 'unavailable'>, string> = {
	echo: 'package main\n\nimport (\n\t"io"\n\t"os"\n)\n\nfunc main() {\n\tb, _ := io.ReadAll(os.Stdin)\n\tos.Stdout.Write(b)\n}\n',
	mixed: [
		'package main',
		'',
		'import (',
		'\t"io"',
		'\t"os"',
		')',
		'',
		'func main() {',
		'\tb, _ := io.ReadAll(os.Stdin)',
		'\tswitch string(b) {',
		'\tcase "crash":',
		'\t\tos.Exit(1)',
		'\tcase "hang":',
		'\t\tfor {',
		'\t\t}',
		'\t}',
		'\tos.Stdout.Write(b)',
		'}',
		''
	].join('\n'),
	hang: 'package main\n\nfunc main() {\n\tfor {\n\t}\n}\n',
	doesNotCompile: 'package main\n\nfunc main() {\n'
};

runnerContract('HTTP adapter + Runner + Docker (go)', (kind) =>
	kind === 'unavailable'
		? {
				runner: createHttpRunner({ url: 'http://127.0.0.1:1', token }),
				language: 'go',
				files: { 'main.go': '' }
			}
		: { runner, language: 'go', files: { 'main.go': goPrograms[kind] } }
);

describe('Runner: go in a fresh Sandbox per run', { timeout: 60_000 }, () => {
	const runGo = (
		files: Record<string, string>,
		tests = [{ id: 't', input: '' }],
		lim = { timeoutMs: 2000, memoryMb: 256 }
	) => runner.execute({ language: 'go', files, tests, limits: lim });

	const sum = [
		'package main',
		'',
		'import (',
		'\t"bufio"',
		'\t"fmt"',
		'\t"os"',
		')',
		'',
		'func main() {',
		'\tvar a, b int',
		'\tfmt.Fscan(bufio.NewReader(os.Stdin), &a, &b)',
		'\tfmt.Println(a + b)',
		'}',
		''
	].join('\n');

	it('passes a correct solution', async () => {
		const result = await runGo({ 'main.go': sum }, [{ id: 't', input: '2 3\n' }]);

		expect(result).toEqual({
			results: [{ id: 't', status: 'ok', stdout: '5\n', stderr: '' }]
		});
	});

	it('reports a wrong answer as ok output for the core to compare', async () => {
		const result = await runGo({ 'main.go': sum }, [{ id: 't', input: '2 2\n' }]);

		expect(result.results[0]).toMatchObject({ status: 'ok', stdout: '4\n' });
	});

	it('reports a panic as a runtime error with the message on stderr', async () => {
		const result = await runGo({
			'main.go': 'package main\n\nfunc main() {\n\tvar a []int\n\t_ = a[3]\n}\n'
		});

		expect(result.results[0].status).toBe('runtimeError');
		expect(result.results[0].stderr).toContain('index out of range');
	});

	it('reports a compile error with file:line:col diagnostics and no results', async () => {
		const result = await runGo({
			'main.go': 'package main\n\nimport "os"\n\nfunc main() {\n}\n'
		});

		expect(result.compileError).toMatch(/main\.go:3:8: /);
		expect(result.compileError).toContain('"os" imported and not used');
		expect(result.results).toEqual([]);
	});

	it('reports a missing func main as a compile error, from the linker', async () => {
		const result = await runGo({ 'main.go': 'package main\n' });

		expect(result.compileError).toContain('function main is undeclared in the main package');
		expect(result.results).toEqual([]);
	});

	it('reports a package that is not main as a compile error', async () => {
		const result = await runGo({ 'main.go': 'package foo\n\nfunc F() {}\n' });

		expect(result.compileError).toContain('requires exactly one main package');
		expect(result.results).toEqual([]);
	});

	it('reports a Build that mixes packages as a compile error', async () => {
		const result = await runGo({
			'main.go': 'package main\n\nfunc main() {}\n',
			'util.go': 'package util\n'
		});

		expect(result.compileError).toContain('found packages');
		expect(result.results).toEqual([]);
	});

	it('reports a cgo-only file as a compile error: cgo is off', async () => {
		const result = await runGo({ 'main.go': 'package main\n\nimport "C"\n\nfunc main() {}\n' });

		expect(result.compileError).toContain('build constraints exclude all Go files');
		expect(result.results).toEqual([]);
	});

	it('reports a Build with no .go file as a compile error without running go build', async () => {
		const result = await runGo({ 'main.txt': 'hello' });

		expect(result).toEqual({
			compileError: 'No .go file in the Build (expected main.go)',
			results: []
		});
	});

	it('runs a Build of several files in package main', async () => {
		const result = await runGo({
			'main.go': 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println(twice(21)) }\n',
			'util.go': 'package main\n\nfunc twice(n int) int { return n * 2 }\n'
		});

		expect(result.compileError).toBeUndefined();
		expect(result.results[0]).toMatchObject({ status: 'ok', stdout: '42\n' });
	});

	it('ignores a learner go.mod: it cannot pick a toolchain or ask for a dependency', async () => {
		const result = await runGo({
			'main.go': 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("fine") }\n',
			'go.mod': 'module evil\n\ngo 1.99\n\ntoolchain go9.9.9\n\nrequire github.com/x/y v1.0.0\n'
		});

		expect(result.compileError).toBeUndefined();
		expect(result.results[0]).toMatchObject({ status: 'ok', stdout: 'fine\n' });
	});

	it('reports an import it cannot fetch as a compile error: the Sandbox has no network', async () => {
		const result = await runGo({
			'main.go': 'package main\n\nimport _ "github.com/x/y"\n\nfunc main() {}\n'
		});

		expect(result.compileError).toMatch(/main\.go:3:\d+: /);
		expect(result.results).toEqual([]);
	});

	it('compiles a typical solution within the time limit, with the standard packages pre-warmed', async () => {
		const main = [
			'package main',
			'',
			'import (',
			'\t"bufio"',
			'\t"container/heap"',
			'\t"fmt"',
			'\t"os"',
			'\t"slices"',
			'\t"sort"',
			'\t"strconv"',
			'\t"strings"',
			')',
			'',
			'type h []int',
			'',
			'func (x h) Len() int           { return len(x) }',
			'func (x h) Less(i, j int) bool { return x[i] < x[j] }',
			'func (x h) Swap(i, j int)      { x[i], x[j] = x[j], x[i] }',
			'func (x *h) Push(v any)        { *x = append(*x, v.(int)) }',
			'func (x *h) Pop() any          { o := *x; v := o[len(o)-1]; *x = o[:len(o)-1]; return v }',
			'',
			'func main() {',
			'\ts, _ := bufio.NewReader(os.Stdin).ReadString(0)',
			'\tq := &h{}',
			'\tfor _, f := range strings.Fields(s) {',
			'\t\tn, _ := strconv.Atoi(f)',
			'\t\theap.Push(q, n)',
			'\t}',
			'\tout := []int{}',
			'\tfor q.Len() > 0 {',
			'\t\tout = append(out, heap.Pop(q).(int))',
			'\t}',
			'\tsort.Sort(sort.Reverse(sort.IntSlice(out)))',
			'\tfmt.Println(slices.Max(out), out)',
			'}',
			''
		].join('\n');
		const started = Date.now();

		const result = await runGo({ 'main.go': main }, [{ id: 't', input: '3 1 2' }]);

		expect(result.results[0]).toMatchObject({ status: 'ok', stdout: '3 [3 2 1]\n' });
		// The whole request: container start, compile and one Test. Cold, the standard packages alone take longer.
		expect(Date.now() - started).toBeLessThan(3000);
	});

	it('fails the run as a Runner error, not a compile error, when the compile step is killed', async () => {
		// Valid code whose compilation outgrows the memory limit: the kernel kills the compiler, so
		// go build exits 1 with no file:line:col diagnostic.
		const huge = `package main\n\nvar x = []int{${'1,'.repeat(900_000)}}\n\nfunc main() { println(len(x)) }\n`;

		await expect(
			runGo({ 'main.go': huge }, undefined, { timeoutMs: 2000, memoryMb: 48 })
		).rejects.toThrow(/Runner responded 500/);
	});

	it('keeps learner code away from the hidden inputs of other Tests', async () => {
		const main = [
			'package main',
			'',
			'import (',
			'\t"fmt"',
			'\t"io"',
			'\t"io/fs"',
			'\t"os"',
			'\t"path/filepath"',
			'\t"strings"',
			')',
			'',
			'func main() {',
			'\tdata, _ := io.ReadAll(os.Stdin)',
			'\tvar seen []string',
			'\tfilepath.WalkDir("/work", func(p string, d fs.DirEntry, err error) error {',
			'\t\tif err == nil && !d.IsDir() && p != "/work/build/main.go" {',
			'\t\t\tb, _ := os.ReadFile(p)',
			'\t\t\tseen = append(seen, p+" "+string(b))',
			'\t\t}',
			'\t\treturn nil',
			'\t})',
			'\tfor _, w := range []string{"/work/stash", "/work/build/stash", "/exec/stash"} {',
			'\t\tos.WriteFile(w, data, 0o600)',
			'\t}',
			'\tfmt.Println(strings.Join(seen, "\\n"))',
			'}',
			''
		].join('\n');

		const result = await runGo({ 'main.go': main }, [
			{ id: 'hidden', input: 'SECRET-hidden-input' },
			{ id: 'example', input: 'SECRET-example' }
		]);

		expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok']);
		for (const r of result.results) {
			expect(r.stdout + r.stderr).not.toContain('SECRET');
			expect(r.stdout).toBe('\n');
		}
	});

	it('kills a process a Test left behind, even one that detached', async () => {
		const main = [
			'package main',
			'',
			'import (',
			'\t"fmt"',
			'\t"io"',
			'\t"os"',
			'\t"os/exec"',
			'\t"syscall"',
			'\t"time"',
			')',
			'',
			'func main() {',
			'\tdata, _ := io.ReadAll(os.Stdin)',
			'\tif string(data) == "first" {',
			'\t\tc := exec.Command("sh", "-c", "sleep 1; echo alive > /work/survivor")',
			'\t\tc.SysProcAttr = &syscall.SysProcAttr{Setsid: true}',
			'\t\tc.Start()',
			'\t\treturn',
			'\t}',
			'\ttime.Sleep(1500 * time.Millisecond)',
			'\t_, err := os.Stat("/work/survivor")',
			'\tfmt.Println(err == nil)',
			'}',
			''
		].join('\n');

		const result = await runGo({ 'main.go': main }, [
			{ id: 'first', input: 'first' },
			{ id: 'second', input: 'second' }
		]);

		expect(result.results[1]).toMatchObject({ status: 'ok', stdout: 'false\n' });
	});

	it('wipes /exec and restores the binary before every Test: what a Test writes there is gone', async () => {
		const main = [
			'package main',
			'',
			'import (',
			'\t"fmt"',
			'\t"io"',
			'\t"os"',
			')',
			'',
			'func main() {',
			'\tdata, _ := io.ReadAll(os.Stdin)',
			'\tif string(data) == "first" {',
			'\t\tos.WriteFile("/exec/leftover", []byte("SECRET-exec"), 0o700)',
			'\t\tos.Mkdir("/exec/dir", 0o700)',
			'\t\tos.WriteFile("/exec/dir/nested", []byte("x"), 0o700)',
			// Swapping the running binary for another must not reach the next Test either.
			'\t\tos.Rename("/exec/main", "/exec/old")',
			'\t\tos.WriteFile("/exec/main", []byte("poison"), 0o700)',
			'\t\treturn',
			'\t}',
			'\tentries, _ := os.ReadDir("/exec")',
			'\tfor _, e := range entries {',
			'\t\tinfo, _ := e.Info()',
			'\t\tfmt.Println(e.Name(), info.Size() > 1000)',
			'\t}',
			'}',
			''
		].join('\n');

		const result = await runGo({ 'main.go': main }, [
			{ id: 'first', input: 'first' },
			{ id: 'second', input: 'second' },
			{ id: 'third', input: 'second' }
		]);

		expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
		expect(result.results[1].stdout).toBe('main true\n');
		expect(result.results[2].stdout).toBe('main true\n');
	});
});

const limits = { timeoutMs: 2000, memoryMb: 256 };
const run = (files: Record<string, string>, tests = [{ id: 't', input: '' }], lim = limits) =>
	runner.execute({
		language: 'python',
		files,
		tests,
		limits: lim
	} satisfies ExecuteRequest);

describe('Runner: python in a fresh Sandbox per run', { timeout: 60_000 }, () => {
	it('returns the output of correct code', async () => {
		const result = await run({ 'main.py': 'a, b = map(int, input().split())\nprint(a + b)\n' }, [
			{ id: 't', input: '2 3\n' }
		]);

		expect(result).toEqual({
			results: [{ id: 't', status: 'ok', stdout: '5\n', stderr: '' }]
		});
	});

	it('reports a runtime error with the traceback on stderr', async () => {
		const result = await run({ 'main.py': 'raise ValueError("boom")\n' });

		expect(result.results[0].status).toBe('runtimeError');
		expect(result.results[0].stderr).toContain('ValueError: boom');
	});

	it('reports a compile error with the compiler message and no results', async () => {
		const result = await run({ 'main.py': 'def (:\n' });

		expect(result.compileError).toContain('SyntaxError');
		expect(result.results).toEqual([]);
	});

	it('reports a null byte in the source as a compile error', async () => {
		const result = await run({ 'main.py': 'x = 1\0\n' });

		expect(result.compileError).toContain('null bytes');
		expect(result.results).toEqual([]);
	});

	it('fails the run as a Runner error, not a compile error, when the compile step is killed', async () => {
		// Valid code whose parse tree outgrows the memory limit: the kernel kills py_compile, not
		// the harness. A huge literal needs no test-only knob, so nothing learner code could reach.
		const huge = `x = (${'1,'.repeat(700_000)})\n`;

		await expect(
			run({ 'main.py': huge }, undefined, { timeoutMs: 2000, memoryMb: 48 })
		).rejects.toThrow(/Runner responded 500/);
	});

	it('runs a Build of several files', async () => {
		const result = await run({
			'main.py': 'from util.helper import twice\nprint(twice(21))\n',
			'util/helper.py': 'def twice(n):\n    return n * 2\n'
		});

		expect(result.results[0]).toMatchObject({ status: 'ok', stdout: '42\n' });
	});

	it('compiles with the real py_compile even if the Build ships a file of that name', async () => {
		const result = await run({
			'main.py': 'print("fine")\n',
			'py_compile.py': 'raise SystemExit("shadowed")\n'
		});

		expect(result.compileError).toBeUndefined();
		expect(result.results[0]).toMatchObject({
			status: 'ok',
			stdout: 'fine\n'
		});
	});

	it('times out an infinite loop within the per-Test limit, not the request timeout', async () => {
		const started = Date.now();

		const result = await run({ 'main.py': 'while True:\n    pass\n' }, undefined, {
			timeoutMs: 60_000,
			memoryMb: 256
		});

		expect(result.results[0].status).toBe('timeout');
		expect(Date.now() - started).toBeLessThan(sandboxConfig.containerTimeoutMs);
	});

	it('honours a lower per-Test limit', async () => {
		const started = Date.now();

		const result = await run({ 'main.py': 'while True:\n    pass\n' }, undefined, {
			timeoutMs: 300,
			memoryMb: 256
		});

		expect(result.results[0].status).toBe('timeout');
		expect(Date.now() - started).toBeLessThan(1900);
	});

	it('kills the container at the hard limit and times out every unfinished Test', async () => {
		const tests = Array.from({ length: 8 }, (_, i) => ({
			id: `t${i}`,
			input: ''
		}));
		const started = Date.now();

		const result = await run({ 'main.py': 'while True:\n    pass\n' }, tests);

		expect(result.results.map((r) => r.status)).toEqual(tests.map(() => 'timeout'));
		expect(Date.now() - started).toBeLessThan(sandboxConfig.containerTimeoutMs + 5000);
		expect(await containersOwnedBy(engine, instanceId)).toEqual([]);
	});

	it('runs learner code unprivileged, offline and on a read-only root', async () => {
		const probe = [
			'import os, socket',
			'status = dict(l.split(":\\t", 1) for l in open("/proc/self/status").read().splitlines() if ":\\t" in l)',
			'print("uid", os.getuid(), os.getgid())',
			'print("caps", status["CapEff"].strip())',
			'print("nnp", status["NoNewPrivs"].strip())',
			'try:',
			'    socket.create_connection(("1.1.1.1", 53), timeout=1)',
			'    print("online")',
			'except OSError:',
			'    print("offline")',
			'try:',
			'    open("/etc/x", "w")',
			'    print("root writable")',
			'except OSError:',
			'    print("root read-only")',
			'open("/work/scratch", "w").write("ok")',
			'print("work writable")',
			''
		].join('\n');

		const result = await run({ 'main.py': probe });

		expect(result.results[0].stderr).toBe('');
		expect(result.results[0].stdout.split('\n')).toEqual([
			'uid 65534 65534',
			'caps 0000000000000000',
			'nnp 1',
			'offline',
			'root read-only',
			'work writable',
			''
		]);
	});

	it('keeps learner code away from the harness result channel', async () => {
		const probe = [
			'import os, signal',
			'try:',
			'    open("/proc/1/fd/1", "w")',
			'    print("forgeable")',
			'except OSError:',
			'    print("protected")',
			'os.kill(1, signal.SIGINT)',
			'print("harness alive")',
			''
		].join('\n');

		const result = await run({ 'main.py': probe });

		expect(result.results).toEqual([
			{
				id: 't',
				status: 'ok',
				stdout: 'protected\nharness alive\n',
				stderr: ''
			}
		]);
	});

	it('caps stdout and marks it truncated', async () => {
		const result = await run({ 'main.py': 'print("x" * 500000)\n' });

		const { stdout } = result.results[0];
		expect(result.results[0].status).toBe('ok');
		expect(stdout.startsWith('x'.repeat(1000))).toBe(true);
		expect(stdout.length).toBeLessThan(sandboxConfig.outputCapBytes + 100);
		expect(stdout.endsWith('[output truncated]')).toBe(true);
	});

	it('leaves no container behind after success, failure or timeout', async () => {
		await run({ 'main.py': 'print(1)\n' });
		await run({ 'main.py': 'raise SystemExit(3)\n' });
		await run({ 'main.py': 'def (:\n' });
		await run({ 'main.py': 'while True:\n    pass\n' });

		expect(await containersOwnedBy(engine, instanceId)).toEqual([]);
	});

	it('rejects with the Runner process refusing a wrong token', async () => {
		const wrong = createHttpRunner({ url, token: 'wrong' });

		await expect(
			wrong.execute({
				language: 'python',
				files: { 'main.py': '' },
				tests: [],
				limits
			})
		).rejects.toThrow(/401/);
	});
});

/** Drives the harness container directly, so a test can change its env or read its exit status. */
async function runHarness(
	files: Record<string, string>,
	inputs: string[],
	env: Record<string, string> = {}
) {
	const spec = containerSpec('python', 'test-instance', inputs.length, 2000, 256);
	const merged = [
		...spec.Env.filter((e) => !(e.split('=')[0] in env)),
		...Object.entries(env).map(([k, v]) => `${k}=${v}`)
	];
	const id = await engine.create(sandboxConfig.pythonImage, {
		...spec,
		Env: merged
	});
	const { status: exit } = await engine.wait(id);
	let out = '';
	const conn = await engine.attach(
		id,
		(stream, payload) => {
			if (stream === 1) out += payload.toString('utf8');
		},
		5000
	);
	await engine.start(id);
	const tar = createTar([
		...Object.entries(files).map(([path, content]) => ({
			path: `build/${path}`,
			content
		})),
		...inputs.map((input, i) => ({ path: `tests/${i}.in`, content: input }))
	]);
	conn.sendInput(Buffer.concat([Buffer.from(`${tar.length}\n`), tar]));
	await conn.closed;
	const status = await exit;
	await engine.remove(id);
	const lines = out
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l));
	return { status, lines };
}

describe('Runner: the harness cannot be hijacked by learner code', { timeout: 60_000 }, () => {
	it('does not let a learner-written traceback.py forge results after tests/N.in is deleted', async () => {
		const forged =
			'import json, sys\nfor i in (0, 1):\n    sys.stdout.write(json.dumps({"i": i, "status": "ok", "stdout": "FORGED", "stderr": ""}) + "\\n")\n';
		const main = [
			'import os',
			`open("/work/build/traceback.py", "w").write(${JSON.stringify(forged)})`,
			'for n in (1, 2):',
			'    try:',
			'        os.remove("/work/tests/%d.in" % n)',
			'    except OSError:',
			'        pass',
			''
		].join('\n');

		const result = await run({ 'main.py': main }, [
			{ id: 'a', input: '' },
			{ id: 'b', input: '' },
			{ id: 'c', input: '' }
		]);

		expect(JSON.stringify(result)).not.toContain('FORGED');
		expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
	});

	it('is not aborted by learner code signalling PID 1', async () => {
		const main = 'import os, signal\nos.kill(1, signal.SIGALRM)\nprint("still here")\n';

		const result = await run({ 'main.py': main });

		expect(result.results).toEqual([{ id: 't', status: 'ok', stdout: 'still here\n', stderr: '' }]);
	});

	it('kills every process a Test left behind, even ones that detached', async () => {
		const first = [
			'import os, time',
			'if os.fork() == 0:',
			'    os.setsid()',
			'    if os.fork() == 0:',
			'        time.sleep(1)',
			'        open("/work/survivor", "w").write("alive")',
			'    os._exit(0)',
			''
		].join('\n');
		const main = `import os, sys, time\nif sys.stdin.read() == "first":\n${first
			.split('\n')
			.map((l) => `    ${l}`)
			.join('\n')}\nelse:\n    time.sleep(1.5)\n    print(os.path.exists("/work/survivor"))\n`;

		const result = await run({ 'main.py': main }, [
			{ id: 'first', input: 'first' },
			{ id: 'second', input: 'second' }
		]);

		expect(result.results[1]).toMatchObject({
			status: 'ok',
			stdout: 'False\n'
		});
	});

	it('does not leak any Test input to learner code, not from /work/tests nor via files a Test left behind', async () => {
		const main = [
			'import os, sys',
			'data = sys.stdin.read()',
			'for root, _, names in os.walk("/work"):',
			'    for name in names:',
			'        path = os.path.join(root, name)',
			'        if path != "/work/build/main.py":',
			'            print(path, open(path, "rb").read().decode("utf-8", "replace"))',
			'for where in ("/work/stash", "/work/build/stash", "/work/tests/stash"):',
			'    try:',
			'        open(where, "w").write(data)',
			'    except OSError:',
			'        pass',
			''
		].join('\n');

		const result = await run({ 'main.py': main }, [
			{ id: 'hidden', input: 'SECRET-hidden-input' },
			{ id: 'example-1', input: 'SECRET-example-one' },
			{ id: 'example-2', input: 'SECRET-example-two' }
		]);

		expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
		for (const r of result.results) {
			expect(r.stdout + r.stderr).not.toContain('SECRET');
			expect(r.stdout).toBe('');
		}
	});

	it('survives learner code that locks /work or nests directories deeply, and carries nothing over in /work metadata', async () => {
		const main = [
			'import os, sys',
			'data = sys.stdin.read()',
			'seen = []',
			'try:',
			'    seen.append(str(os.stat("/work").st_mtime))',
			'    seen.append(repr(os.listxattr("/work")))',
			'    seen.append(oct(os.stat("/work").st_mode & 0o777))',
			'except OSError as e:',
			'    seen.append("err")',
			'print(*seen)',
			'os.makedirs("/work/deep", exist_ok=True)',
			'os.chdir("/work/deep")',
			'for _ in range(1500):',
			'    os.mkdir("a")',
			'    os.chdir("a")',
			'os.chdir("/")',
			'try:',
			'    os.setxattr("/work", "user.stash", data.encode())',
			'except OSError:',
			'    pass',
			'os.utime("/work", (int(data[-3:]) if data[-3:].isdigit() else 7, 123456789))',
			'os.chmod("/work", 0)',
			''
		].join('\n');

		const result = await run({ 'main.py': main }, [
			{ id: 'a', input: 'SECRET-111' },
			{ id: 'b', input: 'SECRET-222' },
			{ id: 'c', input: 'SECRET-333' }
		]);

		expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
		const outputs = result.results.map((r) => r.stdout);
		expect(outputs[1]).toBe(outputs[0]);
		expect(outputs[2]).toBe(outputs[0]);
		expect(outputs[0]).not.toContain('user.stash');
		expect(outputs[0]).not.toContain('123456789');
		expect(outputs[0]).toContain('0o700');
	});

	it('stops printing results and exits non-zero when something unexpected happens', async () => {
		// A Test input missing from the archive makes the harness fail before any learner code runs.
		const spec = containerSpec('python', 'test-instance', 2, 2000, 256);
		const id = await engine.create(sandboxConfig.pythonImage, spec);
		const { status: exit } = await engine.wait(id);
		let out = '';
		const conn = await engine.attach(
			id,
			(s, p) => {
				if (s === 1) out += p.toString();
			},
			5000
		);
		await engine.start(id);
		const tar = createTar([
			{ path: 'build/main.py', content: 'print(1)' },
			{ path: 'tests/0.in', content: '' }
		]);
		conn.sendInput(Buffer.concat([Buffer.from(`${tar.length}\n`), tar]));
		await conn.closed;

		expect(await exit).not.toBe(0);
		expect(out).toBe('');
		await engine.remove(id);
	});

	it('exits on its own at the in-container deadline if the Runner is gone', async () => {
		const started = Date.now();

		const { status, lines } = await runHarness({ 'main.py': 'while True:\n    pass\n' }, [''], {
			RUNNER_DEADLINE_S: '1',
			RUNNER_TEST_TIMEOUT_MS: '60000'
		});

		expect(status).not.toBe(0);
		expect(lines).toEqual([]);
		expect(Date.now() - started).toBeLessThan(6000);
	});

	it('gives Tests past the total output budget empty, truncated output but still runs them', async () => {
		const main = 'import sys\nsys.stdout.write("x" * 1000)\nsys.stderr.write("y" * 1000)\n';

		const { status, lines } = await runHarness({ 'main.py': main }, ['', '', '', ''], {
			RUNNER_TOTAL_OUTPUT_CAP: '3000'
		});

		expect(status).toBe(0);
		expect(lines.map((l) => [l.status, l.stdout.length > 0 && !l.stdout.startsWith('x')])).toEqual([
			['ok', false],
			['ok', false],
			['ok', true],
			['ok', true]
		]);
		expect(lines[3].stdout).toBe('\n[output truncated]');
		expect(lines[3].stderr).toBe('\n[output truncated]');
	});
});

describe('Runner: container configuration', { timeout: 60_000 }, () => {
	it('is created with AutoRemove, no IPC, no log driver and the label', async () => {
		const id = await engine.create(
			sandboxConfig.pythonImage,
			containerSpec('python', 'test-instance', 1, 2000, 256)
		);

		const { HostConfig } = await engine.inspect(id);
		await engine.remove(id);

		expect(HostConfig).toMatchObject({
			AutoRemove: true,
			IpcMode: 'none',
			LogConfig: { Type: 'none' }
		});
	});
});
