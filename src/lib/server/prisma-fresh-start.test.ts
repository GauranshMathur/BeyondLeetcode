import { describe, expect, it } from 'vitest';
import {
	blockClasses,
	Capture,
	childEnv,
	EXPECTED_CORE_CALLS,
	isFailedStart,
	KEEP_HEAD,
	KEEP_TAIL,
	parseStarts,
	parseSummary,
	printable,
	shouldStop
} from './prisma-fresh-start.bun-check.ts';

const summaryLine = (extra = '') =>
	`prisma-fresh-start-child calls=45 core-calls=20 errors=0 other-errors=0 query-engine=0${extra}`;
const clean = { timedOut: false, signal: null, exitCode: 0 };

describe('Capture', () => {
	it('keeps the first and the last part of a flood and reports what it left out', () => {
		const capture = new Capture();
		const chunks = 71;
		const dropped = chunks * 1000 - KEEP_HEAD - KEEP_TAIL;
		for (let sent = 0; sent < chunks * 1000; sent += 1000) {
			capture.push(Buffer.from(`${String(sent / 1000).padStart(4, '0')}${'x'.repeat(995)}\n`));
		}
		const text = capture.text();
		expect(capture.dropped()).toBe(dropped);
		expect(text.startsWith('0000')).toBe(true);
		expect(text).toContain(`[output truncated: ${dropped} bytes`);
		expect(text.endsWith(`${'x'.repeat(995)}\n`)).toBe(true);
		expect(Buffer.byteLength(text)).toBeLessThan(KEEP_HEAD + KEEP_TAIL + 200);
	});

	it('keeps everything and says nothing when the output is small', () => {
		const capture = new Capture();
		capture.push(Buffer.from('one\ntwo\n'));
		expect(capture.text()).toBe('one\ntwo\n');
		expect(capture.dropped()).toBe(0);
	});
});

describe('printable', () => {
	it('indents a line that could stand for the summary, the refusals line or a marker of the parent', () => {
		const out = printable([
			'--- error: start 1, call map',
			'prisma-fresh-start starts=9 calls=9',
			'learning-core refusals (not errors) NotFound=3',
			'--- end of error'
		]);
		expect(out[0]).toBe('--- error: start 1, call map');
		expect(out[1]).toBe('  prisma-fresh-start starts=9 calls=9');
		expect(out[2]).toBe('  learning-core refusals (not errors) NotFound=3');
		expect(out.at(-1)).toBe('--- end of error');
	});

	it('closes a block that the omitted middle cut', () => {
		const out = printable([
			'--- error: start 1, call run',
			'class: Error',
			'[output truncated: 70000 bytes of the child output left out]',
			'tail'
		]);
		expect(out).toEqual([
			'--- error: start 1, call run',
			'class: Error',
			'--- end of error',
			'[output truncated: 70000 bytes of the child output left out]',
			'tail'
		]);
	});
});

describe('parseSummary', () => {
	it('reads the counts, the classes and the refusals', () => {
		const found = parseSummary(summaryLine(' Error=1 refused-NotFound=2'));
		expect(found?.get('core-calls')).toBe(20);
		expect(found?.get('Error')).toBe(1);
		expect(found?.get('refused-NotFound')).toBe(2);
	});

	it('refuses a line with a count missing or not a count', () => {
		expect(parseSummary('prisma-fresh-start-child calls=1 errors=0 query-engine=0')).toBeNull();
		expect(parseSummary(summaryLine(' Error=x'))).toBeNull();
		expect(parseSummary('something else')).toBeNull();
	});
});

describe('isFailedStart', () => {
	const ok = () => parseSummary(summaryLine());
	it('does not fail a clean start', () => {
		expect(isFailedStart(clean, ok())).toBe(false);
	});

	it.each([
		['a timeout', { ...clean, timedOut: true }, ok()],
		['a signal', { ...clean, signal: 'SIGKILL' }, ok()],
		['a non-zero exit', { ...clean, exitCode: 3 }, ok()],
		['no summary', clean, null],
		[
			'an error that is not a refusal',
			clean,
			parseSummary(summaryLine().replace('other-errors=0', 'other-errors=1'))
		],
		[
			'no Learning-core call',
			clean,
			parseSummary(summaryLine().replace('core-calls=20', 'core-calls=0'))
		],
		['a summary with a field missing', clean, parseSummary('prisma-fresh-start-child calls=3')]
	])('fails a start with %s', (_name, outcome, summary) => {
		expect(isFailedStart(outcome, summary)).toBe(true);
	});

	it('counts a start with only PrismaClient errors as an error, not as a failed start', () => {
		const summary = parseSummary(
			'prisma-fresh-start-child calls=45 core-calls=20 errors=2 other-errors=0 query-engine=2 PrismaClientRustPanicError=2'
		);
		expect(isFailedStart({ ...clean, exitCode: 1 }, summary)).toBe(false);
	});
});

describe('parseStarts', () => {
	it.each(['1', '8', '20', '1000'])('accepts %s', (value) => {
		expect(parseStarts(value)).toBe(Number(value));
	});
	it.each([undefined, '', '0', '08', '1001', '1e3', '0x10', '2.0', '-1', ' 1', '1\n2', '١٢'])(
		'refuses %j',
		(value) => {
			expect(parseStarts(value)).toBeNull();
		}
	);
});

describe('childEnv', () => {
	it('holds only the allowlist and the database', () => {
		const env = childEnv(
			{
				PATH: '/bin',
				HOME: '/home/bun',
				CONTENT_DIR: 'content',
				NODE_ENV: 'production',
				GITHUB_TOKEN: 'a',
				ACTIONS_RUNTIME_TOKEN: 'b',
				BETTER_AUTH_SECRET: 'c',
				RUNNER_TOKEN: 'd',
				DATABASE_URL: 'file:/template.db',
				DEBUG: '*'
			},
			'file:/copy.db'
		);
		expect(Object.keys(env).sort()).toEqual([
			'CONTENT_DIR',
			'DATABASE_URL',
			'HOME',
			'NODE_ENV',
			'PATH'
		]);
		expect(env.DATABASE_URL).toBe('file:/copy.db');
	});
});

describe('shouldStop', () => {
	it('stops at the third timed-out start in a row', () => {
		expect(shouldStop(2)).toBe(false);
		expect(shouldStop(3)).toBe(true);
	});
});

describe('blockClasses', () => {
	it('reads the class of each error block a child printed before it died', () => {
		const lines = [
			'--- error: start 1, call reachChapterEnd dynamic-arrays-cpython-list',
			'class: PrismaClientUnknownRequestError',
			'message:',
			'    Out of bounds memory access',
			'--- end of error',
			'error: attempted to take ownership of Rust value while it was borrowed'
		];
		expect(blockClasses(lines)).toEqual(['PrismaClientUnknownRequestError']);
	});

	it('does not count an indented look-alike', () => {
		expect(blockClasses(['    --- error: start 1, call map', 'class: Error'])).toEqual([]);
	});
});

describe('the Learning-core call bound', () => {
	it('fails a start that made one call fewer than the flow has', () => {
		const summary = parseSummary(
			`prisma-fresh-start-child calls=45 core-calls=${EXPECTED_CORE_CALLS - 1} errors=0 other-errors=0 query-engine=0`
		);
		expect(isFailedStart(clean, summary)).toBe(true);
	});
});
