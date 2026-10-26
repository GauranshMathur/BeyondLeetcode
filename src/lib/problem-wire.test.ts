import type { ActionResult } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import {
	decodeRefusal,
	encodeRefusal,
	filesDigest,
	toReply,
	WIRE_CODES,
	type WireCode
} from './problem-wire';

describe('a refusal on the wire', () => {
	it.each(WIRE_CODES)('%s reaches the reader as itself, with its revision', (code: WireCode) => {
		const { status, body } = encodeRefusal({ code, revision: 7 });

		expect(status).toBeGreaterThanOrEqual(400);
		expect(decodeRefusal(body)).toEqual({ code, revision: 7 });
		expect(decodeRefusal(encodeRefusal({ code }).body)).toEqual({ code });
	});

	it('keeps codes that share a status apart', () => {
		const a = encodeRefusal({ code: 'InvalidBuild' });
		const b = encodeRefusal({ code: 'BadRequest' });

		expect(a.status).toBe(b.status);
		expect(decodeRefusal(a.body)?.code).toBe('InvalidBuild');
		expect(decodeRefusal(b.body)?.code).toBe('BadRequest');
	});

	it('does not decode what is not a refusal', () => {
		for (const body of [undefined, null, 'x', {}, { message: 'Internal Error' }, { message: 5 }])
			expect(decodeRefusal(body)).toBeUndefined();
	});
});

describe('toReply', () => {
	const sent = (status = 200, redirected = false) => ({ status, redirected });
	const success: ActionResult = { type: 'success', status: 200, data: { revision: 2 } };

	it('passes the data of a success', () => {
		expect(toReply(sent(), success)).toEqual({ ok: true, data: { revision: 2 } });
	});

	it('reads a refusal from the error body, whatever the status', () => {
		const { status, body } = encodeRefusal({ code: 'RunnerUnavailable', revision: 4 });
		const result: ActionResult = { type: 'error', status, error: body };

		expect(toReply(sent(status), result)).toEqual({
			ok: false,
			kind: 'refused',
			code: 'RunnerUnavailable',
			revision: 4
		});
	});

	it('answers 401 as signed out, with or without a body', () => {
		const signedOut = { ok: false, kind: 'signedOut' };

		expect(toReply(sent(401), undefined)).toEqual(signedOut);
		expect(toReply(sent(401), { type: 'error', status: 401, error: { message: 'x' } })).toEqual(
			signedOut
		);
	});

	it('answers a redirect as signed out: the redirected page, or an action redirect result', () => {
		const signedOut = { ok: false, kind: 'signedOut' };

		expect(toReply(sent(200, true), undefined)).toEqual(signedOut);
		expect(toReply(sent(200, true), success)).toEqual(signedOut);
		expect(toReply(sent(200), { type: 'redirect', status: 303, location: '/signin' })).toEqual(
			signedOut
		);
	});

	it('treats an unreadable 4xx as final and anything else unreadable as unreachable', () => {
		expect(toReply(sent(413), undefined)).toEqual({
			ok: false,
			kind: 'refused',
			code: 'BadRequest'
		});
		expect(toReply(sent(500), { type: 'error', status: 500, error: { message: 'boom' } })).toEqual({
			ok: false,
			kind: 'unreachable'
		});
		expect(toReply(sent(502), undefined)).toEqual({ ok: false, kind: 'unreachable' });
		expect(toReply(sent(200), undefined)).toEqual({ ok: false, kind: 'unreachable' });
	});
});

describe('the digest of a Build', () => {
	it('is the same whatever order the paths come in, and tells different files apart', async () => {
		const a = await filesDigest({ 'a.py': 'x', 'b.py': 'y' });
		expect(await filesDigest({ 'b.py': 'y', 'a.py': 'x' })).toBe(a);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(await filesDigest({ 'a.py': 'x', 'b.py': 'z' })).not.toBe(a);
		expect(await filesDigest({ 'a.py': 'xy' })).not.toBe(await filesDigest({ 'a.pyx': 'y' }));
	});
});
