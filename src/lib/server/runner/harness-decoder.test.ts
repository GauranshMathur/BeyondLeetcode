import { describe, expect, it } from 'vitest';
import { sandboxConfig } from './config';
import { createHarnessDecoder, type HarnessEnd } from './harness';

/**
 * The read side of the harness protocol: frames in, how the container ended, a result or a Runner
 * error out. No Engine and no clock.
 */

const tests = [{ id: 'a' }, { id: 'b' }];
const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);

type Frame = readonly [1 | 2, string | Uint8Array];
const line = (value: unknown) => `${JSON.stringify(value)}\n`;
const ok = (i: number, stdout = 'hi', stderr = '') => line({ i, status: 'ok', stdout, stderr });
const exited0: HarnessEnd = { kind: 'exited', code: 0 };

function decode(frames: readonly Frame[], end: HarnessEnd, ids = tests) {
	const decoder = createHarnessDecoder(ids);
	for (const [stream, payload] of frames) {
		decoder.frame(stream, typeof payload === 'string' ? bytes(payload) : payload);
	}
	return decoder.finish(end);
}

describe('harness decoder: results', () => {
	it.each([
		[
			'one line per Test, in order',
			[[1, ok(0, 'x') + ok(1, 'y')]] as Frame[],
			exited0,
			[
				['a', 'ok', 'x'],
				['b', 'ok', 'y']
			]
		],
		[
			'results reported out of order land on their Tests',
			[[1, ok(1, 'y') + ok(0, 'x')]] as Frame[],
			exited0,
			[
				['a', 'ok', 'x'],
				['b', 'ok', 'y']
			]
		],
		[
			'a line split across frames',
			[
				[1, ok(0, 'x').slice(0, 9)],
				[1, ok(0, 'x').slice(9) + ok(1, 'y')]
			] as Frame[],
			exited0,
			[
				['a', 'ok', 'x'],
				['b', 'ok', 'y']
			]
		],
		[
			'a runtimeError and a timeout status pass through',
			[
				[
					1,
					line({ i: 0, status: 'runtimeError', stdout: '', stderr: 'boom' }) +
						line({ i: 1, status: 'timeout', stdout: '', stderr: '' })
				]
			] as Frame[],
			exited0,
			[
				['a', 'runtimeError', ''],
				['b', 'timeout', '']
			]
		]
	])('reads %s', (_name, frames, end, expected) => {
		const result = decode(frames, end);

		expect(result.compileError).toBeUndefined();
		expect(result.results.map((r) => [r.id, r.status, r.stdout])).toEqual(expected);
	});

	it('carries stdout and stderr of a Test as the harness printed them', () => {
		const result = decode([[1, ok(0, 'out', 'err') + ok(1)]], exited0);

		expect(result.results[0]).toEqual({ id: 'a', status: 'ok', stdout: 'out', stderr: 'err' });
	});

	it('splits stdout into lines whatever the frames: a multi-byte character cut by a frame', () => {
		const all = bytes(ok(0, 'héllo') + ok(1));
		const cut = all.indexOf(0xc3) + 1; // between the two bytes of the e-acute
		const result = decode(
			[
				[1, all.slice(0, cut)],
				[1, all.slice(cut)]
			],
			exited0
		);

		expect(result.results[0]?.stdout).toBe('héllo');
	});
});

describe('harness decoder: one TextDecoder per stream', () => {
	it('a stderr frame that ends mid-character cannot prefix the next stdout line', () => {
		const e = bytes('é'); // two bytes
		const result = decode(
			[
				[2, e.slice(0, 1)],
				[1, bytes(ok(0, 'x') + ok(1, 'y'))]
			],
			exited0
		);

		expect(result.results.map((r) => r.stdout)).toEqual(['x', 'y']);
	});

	it('a stdout frame that ends mid-character leaves stderr alone', () => {
		const e = bytes('é');
		const decoder = createHarnessDecoder(tests);
		decoder.frame(1, e.slice(0, 1));
		decoder.frame(2, bytes('oops'));
		decoder.frame(1, e.slice(1));

		expect(() => decoder.finish({ kind: 'exited', code: 1 })).toThrow(/status 1: oops/);
	});
});

describe('harness decoder: compile errors', () => {
	it('answers a compile error with no results', () => {
		expect(decode([[1, line({ compileError: 'bad' })]], exited0)).toEqual({
			compileError: 'bad',
			results: []
		});
	});

	it('takes the first compile error', () => {
		const result = decode(
			[[1, line({ compileError: 'first' }) + line({ compileError: 'second' })]],
			exited0
		);

		expect(result.compileError).toBe('first');
	});

	it('takes a compile error over result lines', () => {
		const result = decode([[1, ok(0) + line({ compileError: 'bad' })]], exited0);

		expect(result).toEqual({ compileError: 'bad', results: [] });
	});
});

describe('harness decoder: output the Runner cannot trust', () => {
	it.each([
		[
			'a result line with an unknown field',
			line({ i: 0, status: 'ok', stdout: '', stderr: '', extra: 1 })
		],
		['a compile error line with an unknown field', line({ compileError: 'x', extra: 1 })],
		['a line that is not JSON', 'not json\n'],
		['a result with an unknown status', line({ i: 0, status: 'maybe', stdout: '', stderr: '' })],
		['a result with a fractional i', line({ i: 0.5, status: 'ok', stdout: '', stderr: '' })],
		['a result with a missing field', line({ i: 0, status: 'ok', stdout: '' })],
		[
			'a result line that claims cutOff',
			line({ i: 0, status: 'timeout', stdout: '', stderr: '', cutOff: true })
		]
	])('fails the Run on %s', (_name, output) => {
		expect(() => decode([[1, ok(0) + output]], exited0)).toThrow(/unexpected line/);
	});

	it('fails the Run on a byte-order mark at the start of stdout, rather than dropping it', () => {
		expect(() => decode([[1, `\uFEFF${ok(0)}${ok(1)}`]], exited0)).toThrow(/unexpected line/);
	});

	it('fails the Run on trailing output that no newline ends', () => {
		expect(() => decode([[1, `${ok(0)}${ok(1)}{"i"`]], exited0)).toThrow(/unexpected line/);
	});

	it.each([
		['exit 0', exited0, /unexpected line/],
		['a hard stop', { kind: 'hardStop' } as HarnessEnd, undefined]
	])('stdout ending in an incomplete UTF-8 sequence: %s', (_name, end, error) => {
		const frames: Frame[] = [[1, new Uint8Array([...bytes(ok(0) + ok(1)), 0xc3])]];

		if (error) expect(() => decode(frames, end)).toThrow(error);
		else expect(decode(frames, end).results.map((r) => r.status)).toEqual(['ok', 'ok']);
	});

	it.each([2, -1, 7])('fails the Run on a result whose i (%i) is outside the Test count', (i) => {
		expect(() =>
			decode([[1, ok(0) + line({ i, status: 'ok', stdout: '', stderr: '' })]], exited0)
		).toThrow(/Test count/);
	});

	it('fails the Run on a duplicate i, even with the same result', () => {
		expect(() => decode([[1, ok(0) + ok(0) + ok(1)]], exited0)).toThrow(/Test 0 twice/);
	});

	it('fails the Run on a duplicate i that comes with a compile error', () => {
		expect(() => decode([[1, ok(0) + ok(0) + line({ compileError: 'x' })]], exited0)).toThrow(
			/twice/
		);
	});

	it('fails the Run on a missing result when the container was not hard-stopped', () => {
		expect(() => decode([[1, ok(0)]], exited0)).toThrow(/without a result for Test b/);
	});

	it('names the harness stderr in a Runner error, capped at 4096 characters', () => {
		const decoder = createHarnessDecoder(tests);
		decoder.frame(2, bytes('e'.repeat(5000)));
		decoder.frame(1, bytes(ok(0)));

		expect(() => decoder.finish(exited0)).toThrow(`Test b: ${'e'.repeat(4096)}`);
	});
});

describe('harness decoder: how the container ended', () => {
	it.each([1, 137, 2])('makes the output untrusted after a non-zero exit (%i)', (code) => {
		expect(() => decode([[1, ok(0) + ok(1)]], { kind: 'exited', code })).toThrow(
			new RegExp(`status ${code}`)
		);
	});

	it('reports the exit status with the harness stderr', () => {
		expect(() =>
			decode(
				[
					[2, 'traceback'],
					[1, ok(0) + ok(1)]
				],
				{ kind: 'exited', code: 1 }
			)
		).toThrow('Sandbox harness exited with status 1: traceback');
	});

	it('answers a missing result as a timeout after a hard stop', () => {
		const result = decode([[1, ok(0)]], { kind: 'hardStop' });

		expect(result.results).toEqual([
			{ id: 'a', status: 'ok', stdout: 'hi', stderr: '' },
			{ id: 'b', status: 'timeout', stdout: '', stderr: '', cutOff: true }
		]);
	});

	it('marks a Test that timed out by its own limit apart from one the hard stop cut off', () => {
		const own = line({ i: 0, status: 'timeout', stdout: '', stderr: '' });

		const result = decode([[1, own]], { kind: 'hardStop' });

		expect(result.results.map((r) => [r.id, r.status, r.cutOff])).toEqual([
			['a', 'timeout', undefined],
			['b', 'timeout', true]
		]);
	});

	it('marks no Test cut off when the container ended on its own', () => {
		const result = decode([[1, ok(0) + ok(1)]], exited0);

		expect(result.results.some((r) => 'cutOff' in r)).toBe(false);
	});

	it('answers every Test a timeout when a hard stop came before any output', () => {
		expect(decode([], { kind: 'hardStop' }).results.map((r) => r.status)).toEqual([
			'timeout',
			'timeout'
		]);
	});

	it('keeps a hard-stopped Run a timeout when its last line is half written', () => {
		const result = decode([[1, `${ok(0)}{"i": 1, "sta`]], { kind: 'hardStop' });

		expect(result.results.map((r) => [r.id, r.status])).toEqual([
			['a', 'ok'],
			['b', 'timeout']
		]);
	});

	it('still refuses a malformed whole line after a hard stop', () => {
		expect(() => decode([[1, 'not json\n']], { kind: 'hardStop' })).toThrow(/unexpected line/);
	});

	it('still refuses an out-of-range or duplicate i after a hard stop', () => {
		expect(() => decode([[1, ok(5)]], { kind: 'hardStop' })).toThrow(/Test count/);
		expect(() => decode([[1, ok(0) + ok(0)]], { kind: 'hardStop' })).toThrow(/twice/);
	});

	it('fails the Run on output overflow, whatever else it printed', () => {
		expect(() => decode([[1, ok(0) + ok(1)]], { kind: 'overflow' })).toThrow(/more output/);
	});

	it('stops reading at the output cap and fails the Run', () => {
		const decoder = createHarnessDecoder(tests);
		const half = new Uint8Array(sandboxConfig.containerOutputMaxBytes / 2 + 1);

		expect(decoder.frame(1, half)).toBe(true);
		expect(decoder.frame(1, half)).toBe(false);
		expect(decoder.frame(1, bytes(ok(0)))).toBe(false);
		expect(() => decoder.finish(exited0)).toThrow(/more output/);
	});
});
