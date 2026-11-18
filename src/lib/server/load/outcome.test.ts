import { describe, expect, it } from 'vitest';
import {
	classifyAnswer,
	finishSubmission,
	nextStep,
	pickSubmission
} from '../../../../scripts/load/outcome.js';

const request = { tests: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
const test = (id: string, status = 'ok', extra: object = {}) => ({
	id,
	status,
	stdout: '',
	stderr: '',
	...extra
});
const answer = (status: number, body: unknown) => ({
	status,
	body: typeof body === 'string' ? body : JSON.stringify(body),
	errorCode: 0
});
const full = (results: object[], extra: object = {}) =>
	classifyAnswer(request, answer(200, { results, ...extra }));

describe('classifyAnswer', () => {
	it('takes a 200 whose results match the request Tests in order as a full result', () => {
		const out = full([test('a'), test('b', 'runtimeError'), test('c', 'timeout')]);
		expect(out.kind).toBe('result');
	});

	it('fails a 200 with a Test missing, repeated or swapped', () => {
		for (const results of [
			[test('a'), test('b')],
			[test('a'), test('b'), test('b')],
			[test('a'), test('c'), test('b')],
			[test('a'), test('b'), test('c'), test('c')]
		]) {
			expect(full(results)).toEqual({ kind: 'failed', reason: 'badTests' });
		}
	});

	it('takes a 503 "Runner is busy" as busy', () => {
		expect(classifyAnswer(request, answer(503, { error: 'Runner is busy' }))).toEqual({
			kind: 'busy'
		});
	});

	it('fails every other answer, with a fixed reason', () => {
		expect(classifyAnswer(request, answer(503, { error: 'Runner is not ready' }))).toEqual({
			kind: 'failed',
			reason: 'otherStatus',
			status: 503
		});
		for (const status of [500, 400, 401]) {
			expect(classifyAnswer(request, answer(status, { error: 'x' }))).toMatchObject({
				kind: 'failed',
				reason: 'otherStatus',
				status
			});
		}
		expect(classifyAnswer(request, { status: 0, body: null, errorCode: 1211 })).toEqual({
			kind: 'failed',
			reason: 'noAnswer',
			errorCode: 1211
		});
		expect(classifyAnswer(request, answer(200, 'not json at all'))).toEqual({
			kind: 'failed',
			reason: 'notJson'
		});
	});

	it('fails a cutOff on a Test that is not a timeout, and a compileError beside results', () => {
		expect(full([test('a', 'ok', { cutOff: true }), test('b'), test('c')]).kind).toBe('failed');
		expect(full([test('a'), test('b'), test('c')], { compileError: 'x' }).kind).toBe('failed');
	});

	it('takes a compileError with no results as a full result', () => {
		expect(full([], { compileError: 'x' }).kind).toBe('result');
	});

	it('fails a Test of the wrong shape', () => {
		expect(full([{ id: 'a', status: 'weird' }, test('b'), test('c')])).toEqual({
			kind: 'failed',
			reason: 'badShape'
		});
	});

	it('never puts anything from the body in a failed reason', () => {
		const marker = 'SECRET-MARKER-123';
		for (const status of [500, 400, 503, 200]) {
			const out = classifyAnswer(request, answer(status, `${marker} not json`));
			expect(JSON.stringify(out)).not.toContain(marker);
		}
		const out = classifyAnswer(request, answer(500, { error: marker }));
		expect(JSON.stringify(out)).not.toContain(marker);
		const bad = full([test('a', 'ok', { stdout: marker, cutOff: true }), test('b'), test('c')]);
		expect(JSON.stringify(bad)).not.toContain(marker);
	});
});

function result(...tests: object[]) {
	const out = full(tests);
	if (out.kind !== 'result') throw new Error('not a result');
	return out.result;
}
const ok3 = () => result(test('a'), test('b'), test('c'));

describe('the stop rule', () => {
	it('ends as Compile Error after a compile error in the first call', () => {
		const r = classifyAnswer(request, answer(200, { compileError: 'x', results: [] }));
		if (r.kind !== 'result') throw new Error('not a result');
		expect(nextStep(0, r.result)).toEqual({ stop: true, end: 'compileError' });
	});

	it('ends as unavailable after a compile error in a later call', () => {
		const r = classifyAnswer(request, answer(200, { compileError: 'x', results: [] }));
		if (r.kind !== 'result') throw new Error('not a result');
		expect(nextStep(1, r.result)).toEqual({ stop: true, end: 'unavailable' });
	});

	it('ends as Time Limit Exceeded at a timeout, in any call', () => {
		const r = result(test('a'), test('b', 'timeout'), test('c'));
		expect(nextStep(0, r)).toEqual({ stop: true, end: 'timeLimit' });
		expect(nextStep(2, r)).toEqual({ stop: true, end: 'timeLimit' });
	});

	it('ends as unavailable when a Test was cut off', () => {
		const r = result(test('a'), test('b', 'timeout', { cutOff: true }), test('c'));
		expect(nextStep(0, r)).toEqual({ stop: true, end: 'unavailable' });
	});

	it('goes on otherwise, and ends clean or as Runtime Error', () => {
		expect(nextStep(0, ok3())).toEqual({ stop: false });
		const bad = result(test('a'), test('b', 'runtimeError'), test('c'));
		expect(nextStep(1, bad)).toEqual({ stop: false });
		expect(finishSubmission([ok3(), ok3()])).toBe('clean');
		expect(finishSubmission([ok3(), bad])).toBe('runtimeError');
	});
});

describe('pickSubmission', () => {
	const languages = ['python', 'typescript', 'go'];
	const list = Array.from({ length: 40 }, (_, p) =>
		languages.map((language) => ({ problemId: `topic-${Math.floor(p / 5)}/p${p}`, language }))
	).flat();

	it('gives the same entry for the same n', () => {
		for (const n of [0, 1, 7, 100]) expect(pickSubmission(list, n)).toBe(pickSubmission(list, n));
	});

	it('covers all three Languages in the first six picks', () => {
		const seen = new Set(Array.from({ length: 6 }, (_, n) => pickSubmission(list, n).language));
		expect([...seen].sort()).toEqual([...languages].sort());
	});

	it('takes consecutive picks from different Topics', () => {
		const topic = (n: number) => pickSubmission(list, n).problemId.split('/')[0];
		for (let n = 0; n < 60; n++) expect(topic(n)).not.toBe(topic(n + 1));
	});

	it('works on a list of one Problem', () => {
		expect(pickSubmission(list.slice(0, 3), 4).language).toBe('typescript');
	});
});
