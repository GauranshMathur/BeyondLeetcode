import { spawnSync } from 'node:child_process';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
	CONTROL_OR_BIDI,
	fixedText,
	formatServerError,
	installLogRedaction,
	isKnownCode,
	type LogPatterns,
	logFailure,
	loggable,
	redactedLine,
	redactingLogger,
	redactText
} from './logging.ts';

afterEach(() => vi.restoreAllMocks());

/**
 * A test pattern set, the shape a secret's owner hands the engine: an invite-like token in a path and in a cookie,
 * 43 base64url characters long. Written as one function so its source can also be run in a real Bun process.
 */
function makePatterns(): LogPatterns {
	const cookieName = 'beyondleetcode_invite';
	const invitePath = /\/invite\/(?:(?!\[)[^\s/?#"')\]]+|[ \t]+[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-]))/g;
	const quote = `\\\\*["']`;
	const cookieText = new RegExp(
		`(?:${quote})?${cookieName}(?:${quote})?[ \\t]*[:=][ \\t]*` +
			`(?:(${quote})[^"'\\n\\\\]*(${quote})?|[^\\s;,"')\\]\\\\]+)`,
		'g'
	);
	return {
		bareTokenLength: 43,
		marked: (text) =>
			text
				.replace(invitePath, '/invite/[redacted]')
				.replace(
					cookieText,
					(_match: string, open?: string, close?: string) =>
						`${cookieName}=${open ?? ''}[redacted]${close ?? ''}`
				)
	};
}
const patterns = makePatterns();
const PATTERNS_SOURCE = `const patterns = (${makePatterns.toString()})();`;
const LOGGING_PATH = new URL('./logging.ts', import.meta.url).pathname;
const INVITE_COOKIE = 'beyondleetcode_invite';

describe('redactText', () => {
	const t = 'CX-OaV5gtW0OAMlGz72BwwkqueZXgU1hi11UKrLIecc';
	const N = INVITE_COOKIE;

	it.each([
		[`/invite/${t}`, '/invite/[redacted]'],
		[`GET /invite/${t}?x=1 done`, 'GET /invite/[redacted]?x=1 done'],
		[`/invite/ ${t}`, '/invite/[redacted]'],
		[`/invite/ \t${t} after`, '/invite/[redacted] after'],
		[`${N}=${t}`, `${N}=[redacted]`],
		[`a=1; ${N} = ${t}; b=2`, `a=1; ${N}=[redacted]; b=2`],
		[`${N}="${t}"`, `${N}="[redacted]"`],
		[`${N}='${t}'`, `${N}='[redacted]'`],
		[`{\\"${N}\\":\\"${t}\\"}`, `{${N}=\\"[redacted]\\"}`],
		[`${N}="${t}`, `${N}="[redacted]`],
		[`${N}='${t} and more`, `${N}='[redacted]`],
		[`{ ${N}: '${t}' }`, `{ ${N}='[redacted]' }`],
		[`{"${N}":"${t}"}`, `{${N}="[redacted]"}`],
		[`${N}=\t${t}`, `${N}=[redacted]`],
		[`?a=1&${N}=${t}`, `?a=1&${N}=[redacted]`],
		[`a|${N}=${t}`, `a|${N}=[redacted]`],
		[`a$${N}=${t}`, `a$${N}=[redacted]`],
		[`a%${N}=${t}`, `a%${N}=[redacted]`],
		[`a#${N}=${t}`, `a#${N}=[redacted]`]
	])('removes the token from %s', (input, expected) => {
		expect(redactText(input, patterns)).toBe(expected);
		expect(redactText(input, patterns)).not.toContain(t);
	});

	it('never crosses into the next line', () => {
		expect(redactText(`${N}=\nnext ${t.slice(0, 5)}`, patterns)).toBe(
			`${N}=\nnext ${t.slice(0, 5)}`
		);
		expect(redactText(`${N}="${t}\nsecond line`, patterns)).toBe(`${N}="[redacted]\nsecond line`);
	});

	it('over-redacts a longer name that ends in ours, and leaves route ids and other text alone', () => {
		// Whatever comes before the name is ignored: redacting a harmless cookie is the safe side.
		expect(redactText(`other_${N}=harmless`, patterns)).toBe(`other_${N}=[redacted]`);
		for (const harmless of ['/invite/[token]', 'unrelated text', 'beyond_invite=1']) {
			expect(redactText(harmless, patterns)).toBe(harmless);
		}
	});
});

describe('redactText with terminal escapes', () => {
	const E = String.fromCharCode(27);
	const t = 'CX-OaV5gtW0OAMlGz72BwwkqueZXgU1hi11UKrLIecc';

	it.each([
		[`${INVITE_COOKIE}=${E}[31m${t}${E}[0m`],
		[`${INVITE_COOKIE}${E}[0m=${t}`],
		[`${INVITE_COOKIE}=${E}[1m${E}[31m ${t}`],
		[`/invite/${E}[32m${t}${E}[0m`],
		[`/invite${E}[0m/${t}`],
		[`${E}]8;;http://x${E}\\/invite/${t}`],
		[`${INVITE_COOKIE}=${String.fromCharCode(0x9b)}31m${t}`],
		// An introducer that starts no complete sequence must not swallow the text after it.
		[`${E}]0;never ended /invite/${t}`],
		[`${E}]0;never ended ${INVITE_COOKIE}=${t}`],
		[`${E} /invite/${t}${E}`],
		[`${INVITE_COOKIE}=${E}[31${t}`],
		[`lone ${E} then /invite/${t}`],
		[`${String.fromCharCode(0x9b)} /invite/${t}`]
	])('takes the token out of %j', (text) => {
		const out = redactText(text, patterns);
		expect(out).not.toContain(t);
		expect(out).toMatch(/\[redacted\]/);
	});

	it.each(['7abc', 'abc', '-abc', 'Abc'])(
		'a placeholder never breaks a match: tokens starting %j after a lone or unterminated introducer',
		(start) => {
			const tok = `${start}${t.slice(start.length)}`;
			for (const text of [
				`/invite/${E}${tok}`,
				`${INVITE_COOKIE}=${E}${tok}`,
				`/invite/${E}]0;${tok}`,
				`${INVITE_COOKIE}=${E}]0;${tok}`,
				`/invite/${E}[${tok}`,
				`${INVITE_COOKIE}=${E}[12${tok}`,
				`/invite/${E}]0;never ended ${tok}`,
				`${INVITE_COOKIE}=${E}]0;x;${tok}`,
				`${E}[ /i${tok}`,
				`${INVITE_COOKIE}=${E}[ /i${tok}`,
				`/invite/${E}[ /i${tok}`,
				`word${E}xyz${tok}`,
				`prefix ${E} ${tok} suffix`
			]) {
				expect(redactText(text, patterns), text).not.toContain(tok.slice(3));
			}
		}
	);

	it('redacts a bare 43-character run only in a record that held an escape', () => {
		const bare = `id ${'A'.repeat(43)} ok`;
		expect(redactText(bare, patterns)).toBe(bare);
		expect(redactText(`${E} ${bare}`, patterns)).not.toContain('A'.repeat(43));
		expect(redactText(`${E} ${'A'.repeat(42)}`, patterns)).toContain('A'.repeat(42));
		expect(redactText(`${E} ${'B'.repeat(44)}`, patterns)).not.toContain('B'.repeat(44));
	});

	it('leaves the route id alone', () => {
		expect(redactText('route /invite/[token] here', patterns)).toBe('route /invite/[token] here');
	});

	it('prints a record with escapes without them, and shows a lone introducer', () => {
		expect(redactText(`colour ${E}[32mgreen${E}[0m ok`, patterns)).toBe('colour green ok');
		expect(redactText(`${E}]8;;http://x${E}\\link`, patterns)).toBe('link');
		expect(redactText(`lone ${E} escape`, patterns)).toBe('lone \u241b escape');
		expect(redactText(`${E}]0;never ended but visible`, patterns)).toBe(
			'\u241bnever ended but visible'
		);
		expect(redactText('plain', patterns)).toBe('plain');
	});
});

const token = 'CX-OaV5gtW0OAMlGz72BwwkqueZXgU1hi11UKrLIecc';
const event = (id: string | null) =>
	({
		request: { method: 'POST' },
		route: { id },
		url: new URL(`http://localhost/invite/${token}`)
	}) as never;

describe('formatServerError', () => {
	it('names the route, never the pathname, and the error by its name only', () => {
		const text = formatServerError(500, new TypeError('boom'), event('/invite/[token]'));

		expect(text).toBe('[500] POST /invite/[token] TypeError');
		expect(text).not.toContain(token);
	});

	it('adds a code when the error has a short one, and never the message, the stack or a cause', () => {
		const error = Object.assign(
			new Error(`failed for /invite/${token}?x=1 beyondleetcode_invite=${token}`),
			{
				code: 'ECONNRESET',
				cause: new Error(`inner ${token}`)
			}
		);
		error.stack = `Error: failed\n    at fetch (http://localhost/invite/${token})`;

		const text = formatServerError(500, error, event('/invite/[token]'));

		expect(text).toBe('[500] POST /invite/[token] Error ECONNRESET');
		expect(text).not.toMatch(/failed|inner|fetch|localhost/);
	});

	it('drops a name or code that is not a short identifier or a known code', () => {
		const error = Object.assign(new Error('x'), { code: `bad code ${token} ${'x'.repeat(80)}` });
		error.name = `Custom\nFAKE-LINE ${token}`;

		expect(formatServerError(500, error, event(null))).toBe('[500] POST (no route) Error');
	});

	it('logs neither the name nor the code when they are an invite token', () => {
		const error = Object.assign(new Error('x'), { code: token });
		error.name = token;

		const text = formatServerError(500, error, event('/invite/[token]'));

		expect(text).toBe('[500] POST /invite/[token] Error');
		expect(text).not.toContain(token);
		// A made-up token-shaped code is not a known one either.
		expect(
			formatServerError(500, Object.assign(new Error('x'), { code: 'CALLER_TEXT' }), event(null))
		).toBe('[500] POST (no route) Error');
	});

	it('writes one line for an unmatched path, and a thrown non-Error by its type', () => {
		expect(formatServerError(404, new Error('x'), event(null))).toBe('[404] POST (no route)');
		expect(formatServerError(500, `/invite/${token}`, event(null))).toBe(
			'[500] POST (no route) string'
		);
		expect(formatServerError(500, { code: 'EPIPE', message: token }, event(null))).toBe(
			'[500] POST (no route) object EPIPE'
		);
		expect(formatServerError(500, null, event(null))).toBe('[500] POST (no route) object');
	});
});

describe('redaction at the console', () => {
	const printing = [
		'error',
		'warn',
		'info',
		'log',
		'debug',
		'trace',
		'dirxml',
		'group',
		'groupCollapsed'
	] as const;
	const cookie = `beyondleetcode_invite=${token}`;
	const leaky = () => {
		const cause = new Error(`inner GET /invite/${token}`);
		const error = new Error(`outer ${cookie}`, { cause });
		error.stack = `Error: outer\n    at x (http://localhost/invite/${token}; ${cookie})`;
		return error;
	};
	const fakeConsole = () => {
		const target: Record<string, Mock<(...args: unknown[]) => unknown>> = {};
		for (const m of [...printing, 'assert', 'dir', 'table']) target[m] = vi.fn();
		return target;
	};
	const printed = (spy: Mock<(...args: unknown[]) => unknown>) =>
		spy.mock.calls
			.flat()
			.map((arg) => inspect(arg, { depth: null }))
			.join('\n');

	it.each(printing)('console.%s prints no token and one redacted string', (method) => {
		const target = fakeConsole();
		const spy = target[method];
		installLogRedaction(patterns, target as unknown as Console);

		target[method](leaky());
		target[method](`plain /invite/${token}`, { url: `/invite/${token}`, cookie }, 42);
		target[method]('/invite/%s', token);
		target[method]('/invite/', token);
		target[method]('route /invite/[token]', 'ok');

		const out = printed(spy);
		expect(out).not.toContain(token);
		expect(out).toContain('/invite/[redacted]');
		expect(out).toContain('beyondleetcode_invite=[redacted]');
		expect(out).toContain('outer');
		expect(out).toContain('42');
		expect(out).toContain('route /invite/[token] ok');
		for (const call of spy.mock.calls) expect(call).toHaveLength(1);
	});

	it('redacts assert (only when it fails), dir and table', () => {
		const target = fakeConsole();
		const spies = { assert: target.assert, dir: target.dir, table: target.table };
		installLogRedaction(patterns, target as unknown as Console);

		target.assert(true, `/invite/${token}`);
		target.assert(false, '/invite/', token);
		target.dir({ url: `/invite/${token}` });
		target.table([{ cookie }]);

		const out = [spies.assert, spies.dir, spies.table].map(printed).join('\n');
		expect(out).not.toContain(token);
		expect(spies.assert.mock.calls[0]).toEqual([true]);
		expect(spies.assert.mock.calls[1]).toEqual([false, '/invite/[redacted]']);
		expect(out).toContain('beyondleetcode_invite=[redacted]');
	});

	it('does not wrap twice, and passes a call with no arguments through', () => {
		const target = fakeConsole();
		const spy = target.error;
		const group = target.group;
		installLogRedaction(patterns, target as unknown as Console);
		const once = target.error;
		installLogRedaction(patterns, target as unknown as Console);

		expect(target.error).toBe(once);
		target.error('x');
		target.group();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(group).toHaveBeenCalledWith();
	});

	it('writes no token to the bytes of a real Bun process, whichever member logs', () => {
		const auth = LOGGING_PATH;
		const script = `
			import { installLogRedaction } from ${JSON.stringify(auth)};
			${PATTERNS_SOURCE}
			installLogRedaction(patterns);
			const t = ${JSON.stringify(token)};
			const e = new Error('outer beyondleetcode_invite=' + t, { cause: new Error('GET /invite/' + t) });
			for (const m of ['error','warn','info','log','debug','dirxml']) { console[m](e); console[m]('/invite/%s', t); console[m]('/invite/', t); }
			console.trace('/invite/' + t);
			console.group('/invite/', t); console.groupCollapsed('/invite/' + t); console.groupEnd(); console.groupEnd();
			console.assert(false, '/invite/', t);
			console.dir({ url: '/invite/' + t });
			console.dir({ beyondleetcode_invite: t }, { colors: true });
			console.dir({ a: 1, beyondleetcode_invite: t }, { colors: true, depth: 0 });
			console.table([{ c: 'beyondleetcode_invite=' + t }]);
			console.log('?a=1&beyondleetcode_invite=' + t);
			console.count('/invite/' + t); console.count('/invite/' + t); console.countReset('/invite/' + t);
			console.count('plain'); console.count('plain');
			console.time('/invite/' + t); console.timeLog('/invite/' + t, 'beyondleetcode_invite=' + t, { url: '/invite/' + t }); console.timeLog('/invite/' + t, '/invite/', t); console.timeLog('/invite/' + t, 'beyondleetcode_invite=%s', t); console.time('beyondleetcode_invite='); console.timeLog('beyondleetcode_invite=', t); console.timeEnd('beyondleetcode_invite=');
			console.timeEnd('/invite/' + t);
			if (typeof console.write === 'function') {
				console.write('/invite/' + t + '\\n');
				console.write(new TextEncoder().encode('beyondleetcode_invite=' + t + '\\n'));
				console.write('MARK', 'a', 'b', '\\n'); console.write('MARK', '100%s', 'x', '\\n');
				const r = console.write(new Uint8Array([0x4d, 0x42, 0xff, 0x0a])); console.write('RET', String(r), '\\n');
				console.write('/invite/', t, '\\n');
				console.write(new TextEncoder().encode('/invite/' + t + '\\n'));
				console.write(new TextEncoder().encode('/invite/' + t), '\\n');
				console.write(new TextEncoder().encode('beyondleetcode_invite=' + t).buffer, 'x\\n');
				console.write(new TextEncoder().encode('beyondleetcode_invite=' + t).buffer);
				console.write('beyondleetcode_invite=%s', t, '\\n');
			}
		`;
		const run = spawnSync('bun', ['-e', script]);
		const bytes = `${run.stdout}${run.stderr}`;
		expect(run.status).toBe(0);
		expect(bytes).not.toContain(token);
		expect(bytes).not.toContain('\u001b[32m'.concat(token));
		expect(bytes).toContain('/invite/[redacted]');
		expect(bytes).toContain('beyondleetcode_invite=[redacted]');
		expect(bytes).toContain('outer');
		// Counters and timers still work: the second count is 2, a timer is found by its label.
		expect(bytes).toContain('plain: 2');
		// write joins with nothing in between and reads no format; invalid UTF-8 comes out as it went in.
		expect(bytes).toContain('MARKab\n');
		expect(bytes).toContain('MARK100%sx\n');
		expect(run.stdout.includes(Buffer.from([0x4d, 0x42, 0xff, 0x0a]))).toBe(true);
		expect(bytes).toContain('RET4\n');
		// timeLog: label and data are one record, and the timer is still found.
		expect(bytes).toMatch(/\[[\d.]+m?s\] beyondleetcode_invite= \[redacted\]/);
		expect(bytes).not.toMatch(/No such label|does not exist/i);
	});

	/** Runs `script` after installing the redaction in a real Bun process; its bytes and exit status. */
	function inBun(script: string) {
		const auth = LOGGING_PATH;
		const run = spawnSync('bun', [
			'-e',
			`import { installLogRedaction } from ${JSON.stringify(auth)}; ${PATTERNS_SOURCE} installLogRedaction(patterns); const t = ${JSON.stringify(token)}; ${script}`
		]);
		return {
			status: run.status,
			out: Buffer.concat([run.stdout, run.stderr]),
			stderr: run.stderr.toString()
		};
	}
	const ESC = String.fromCharCode(27);
	const colours = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

	it("prints no token for escape sequences typed into the caller's own string, and leaves other colours alone", () => {
		const { status, out, stderr } = inBun(String.raw`
			const E = String.fromCharCode(27);
			console.log('beyondleetcode_invite=' + E + '[31m' + t + E + '[0m');
			console.log('beyondleetcode_invite' + E + '[0m=' + t);
			console.log('beyondleetcode_invite=' + E + '[1m' + E + '[31m' + t);
			console.log('/invite/' + E + '[32m' + t + E + '[0m');
			console.log('/invite' + E + '[0m/' + t);
			console.log(E + ']8;;http://x' + E + '\\/invite/' + t);
			console.log('beyondleetcode_invite=' + String.fromCharCode(0x9b) + '31m' + t);
			console.log('colour ' + E + '[32mgreen' + E + '[0m ok');
			// Unterminated or lone introducers must not swallow what follows them.
			console.log(E + ']0;title never ended /invite/' + t);
			console.log(E + ']0;title never ended beyondleetcode_invite=' + t);
			console.log(E + ' /invite/' + t + E);
			console.log('beyondleetcode_invite=' + E + '[31' + t);
			console.log('lone ' + E + ' then /invite/' + t);
			console.log('lone ' + E + ' stays visible');
			console.log('plain text');
		`);
		const text = out.toString('latin1');
		expect(status, stderr).toBe(0);
		expect(text).not.toContain(token);
		// A record with an escape in it is printed without the escapes, redacted: the view that is checked is the
		// view that is printed.
		expect(text).toContain('colour green ok');
		expect(text).not.toContain(ESC);
		expect(text).toContain('beyondleetcode_invite=[redacted]');
		expect(text).toContain('/invite/[redacted]');
		expect(text).toContain('plain text');
		expect(text.match(/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(12);
		expect(out.toString('utf8')).toContain('lone \u241b stays visible');
	});

	it('prints no token when a lone or unterminated introducer sits right before it, whatever its first character', () => {
		const tokens = [
			token,
			`${'7'.repeat(10)}${token.slice(10)}`,
			`abc${token.slice(3).toLowerCase()}`,
			`-${token.slice(1)}`
		];
		const { status, out, stderr } = inBun(`
			const E = String.fromCharCode(27);
			for (const x of ${JSON.stringify(tokens)}) {
				console.log('/invite/' + E + x);
				console.log('beyondleetcode_invite=' + E + x);
				console.log('/invite/' + E + ']0;' + x);
				console.log('beyondleetcode_invite=' + E + ']0;' + x);
				console.log('/invite/' + E + '[' + x);
				console.log('beyondleetcode_invite=' + E + '[12' + x);
				console.log('?a=1&beyondleetcode_invite=' + E + x + '&b=2');
				// Whatever the introducer drags along (a space, a ';', a complete CSI with intermediate bytes) must not
				// keep a token from being found.
				console.log('/invite/' + E + ']0;never ended ' + x);
				console.log('beyondleetcode_invite=' + E + ']0;x;' + x);
				console.log(E + '[ /i' + x);
				console.log('beyondleetcode_invite=' + E + '[ /i' + x);
				console.log('/invite/' + E + '[ /i' + x);
				console.log('word' + E + 'xyz' + x);
				console.log('/invite/' + E + '[ ' + x + ' tail');
				console.log('prefix ' + E + ' ' + x + ' suffix');
			}
			console.log('route /invite/[token] stays');
			console.log('/invite/[token]');
			console.log('id ' + 'A'.repeat(43) + ' ok');
		`);
		const text = out.toString('latin1');
		expect(status, stderr).toBe(0);
		for (const x of tokens) {
			expect(text).not.toContain(x);
			expect(text).not.toContain(x.slice(5));
			expect(text).not.toContain(x.slice(10));
		}
		expect(text.match(/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(45);
		expect(text.match(/\/invite\/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(12);
		expect(text.match(/beyondleetcode_invite=\[redacted\]/g)?.length).toBeGreaterThanOrEqual(12);
		// The route id is not a token and prints as it is; an escape-free 43-character string is not touched.
		expect(text.split('\n')).toContain(`id ${'A'.repeat(43)} ok`);
		expect(text).toContain('route /invite/[token] stays');
		expect(text.split('\n')).toContain('/invite/[token]');
	});

	it('prints no token when console.dir is given a colouring stylize callback, and still prints the value', () => {
		const { status, out, stderr } = inBun(`
			const E = String.fromCharCode(27);
			const stylize = (s) => [...String(s)].map((c) => E + '[31m' + c + E + '[0m').join('');
			console.dir({ beyondleetcode_invite: t, url: '/invite/' + t, keep: 'visible' }, { stylize, colors: true });
			console.dir('/invite/' + t, { stylize });
			console.dir({ plain: 'shown' }, { stylize });
		`);
		const text = out.toString('latin1');
		expect(status, stderr).toBe(0);
		expect(text).not.toContain(token);
		expect(text.replace(colours, '')).not.toContain(token.slice(0, 12));
		expect(text).toContain('visible');
		expect(text).toContain('shown');
		expect(text).toContain('[redacted]');
	});

	it('keeps counters and timers of distinct labels apart while printing only redacted text', () => {
		const other = 'ZZZZ-other-token-of-forty-three-characters_abc';
		const { status, out, stderr } = inBun(`
			const o = ${JSON.stringify(other)};
			console.count('/invite/' + t); console.count('/invite/' + t); console.count('/invite/' + o);
			console.countReset('/invite/' + t); console.count('/invite/' + t); console.count('/invite/' + o);
			console.count('plain'); console.count('plain');
			console.time('/invite/' + t); console.time('/invite/' + o);
			console.timeLog('/invite/' + t, 'first'); console.timeLog('/invite/' + o, 'second');
			console.timeEnd('/invite/' + t); console.timeEnd('/invite/' + o);
		`);
		const text = out.toString();
		expect(status, stderr).toBe(0);
		expect(text).not.toContain(token);
		expect(text).not.toContain(other);
		const lines = text.split('\n');
		// One counter: 1, 2, reset, 1. The other, apart from it: 1, 2.
		expect(lines.filter((l) => l === '/invite/[redacted]: 1')).toHaveLength(2);
		expect(lines).toContain('/invite/[redacted]: 2');
		expect(lines).toContain('/invite/[redacted] (2): 1');
		expect(lines).toContain('/invite/[redacted] (2): 2');
		expect(lines).toContain('plain: 2');
		expect(lines.filter((l) => /^\/invite\/\[redacted\]/.test(l)).length).toBeGreaterThanOrEqual(4);
		// Each timer is found by its own label.
		expect(text).toMatch(/\[[\d.]+m?s\] \/invite\/\[redacted\] first/);
		expect(text).toMatch(/\[[\d.]+m?s\] \/invite\/\[redacted\] \(2\) second/);
		expect(text).toMatch(/\[[\d.]+m?s\] \/invite\/\[redacted\]$/m);
		expect(text).toMatch(/\[[\d.]+m?s\] \/invite\/\[redacted\] \(2\)$/m);
		expect(text).not.toMatch(/No such label|does not exist/i);
	});

	it('redacts a console.write that mixes invalid UTF-8 with token text, keeping the bytes', () => {
		const { status, out, stderr } = inBun(String.raw`
			const bytes = (...n) => new Uint8Array(n);
			const enc = (s) => new TextEncoder().encode(s);
			// Invalid bytes with the token as text, as bytes, and split across arguments.
			console.write(bytes(0xff, 0xfe, 0x20), '/invite/' + t, bytes(0x20, 0xa0, 0x0a));
			console.write(bytes(0xc3, 0x28, 0x20), 'beyondleetcode_invite=', enc(t), bytes(0x0a));
			console.write(bytes(0xff, 0x20), '/invite/', t.slice(0, 20), t.slice(20), '\n');
			console.write(bytes(0x80, 0x81, 0x20), enc('/invite/' + t.slice(0, 10)), enc(t.slice(10)), bytes(0x0a));
			// A multibyte character inside the token must not end it early, in a text-only record or a mixed one.
			console.write(enc('/invite/' + t.slice(0, 10) + 'à' + t.slice(10) + '\n'));
			console.write(bytes(0xff, 0x20), enc('/invite/' + t.slice(0, 10) + 'à ' + t.slice(10) + '\n'));
			console.write('MARK', bytes(0xff), 'a', 'b', '\n');
			console.write(bytes(0x2f, 0x69, 0x6e, 0x76, 0x9b, 0x33, 0x31, 0x6d, 0x69, 0x74, 0x65, 0x2f), enc(t), bytes(0x0a));
			console.write('\ufeffbom ok\n');
			const r = console.write(bytes(0x4d, 0x42, 0xff, 0x0a)); console.write('RET', String(r), '\n');
		`);
		expect(status, stderr).toBe(0);
		const text = out.toString('latin1');
		expect(text).not.toContain(token);
		for (const piece of [
			token.slice(0, 10),
			token.slice(10),
			token.slice(0, 20),
			token.slice(20)
		]) {
			expect(text).not.toContain(piece);
		}
		expect(text).toContain('/invite/[redacted]');
		expect(text).toContain('beyondleetcode_invite=[redacted]');
		// The invalid bytes are still there, byte for byte, and the arguments are joined with nothing in between.
		expect(out.includes(Buffer.from([0xff, 0xfe, 0x20]))).toBe(true);
		expect(out.includes(Buffer.from([0xc3, 0x28, 0x20]))).toBe(true);
		expect(out.includes(Buffer.from([0x80, 0x81, 0x20]))).toBe(true);
		expect(out.includes(Buffer.from([0x20, 0xa0, 0x0a]))).toBe(true);
		expect(
			out.includes(Buffer.concat([Buffer.from('MARK'), Buffer.from([0xff]), Buffer.from('ab\n')]))
		).toBe(true);
		expect(text).toContain('RET4');
		// A one-byte CSI inside the path does not hide the token, and a byte-order mark is kept.
		expect(out.includes(Buffer.from('\ufeffbom ok\n'))).toBe(true);
	});
});

describe('the owner hands the engine its patterns', () => {
	const E = String.fromCharCode(27);

	it('uses the bare token length of the pattern set it is given', () => {
		const short = { marked: (text: string) => text, bareTokenLength: 20 };
		expect(redactText(`${E} ${'A'.repeat(20)}`, short)).not.toContain('A'.repeat(20));
		expect(redactText(`${E} ${'A'.repeat(19)}`, short)).toContain('A'.repeat(19));
		expect(redactText(`${E} ${'A'.repeat(20)}`, patterns)).toContain('A'.repeat(20));
	});

	it('redactedLine formats the whole record before it redacts, and never throws', () => {
		expect(
			redactedLine(['/invite/%s', 'CX-OaV5gtW0OAMlGz72BwwkqueZXgU1hi11UKrLIecc'], patterns)
		).toBe('/invite/[redacted]');
		const hostile = {
			[Symbol.toPrimitive]() {
				throw new Error('no');
			}
		};
		expect(redactedLine(['%s', hostile], patterns)).toBe('[unprintable]');
	});
});

describe('known codes and loggable values', () => {
	it('recognizes a code by being in the list, never by its shape', () => {
		expect(isKnownCode('ECONNRESET')).toBe(true);
		expect(isKnownCode('SIGN_UP_CLOSED')).toBe(true);
		expect(isKnownCode('state_mismatch')).toBe(true);
		expect(isKnownCode('P2002')).toBe(true);
		expect(isKnownCode('CALLER_TEXT')).toBe(false);
		expect(isKnownCode('P12')).toBe(false);
		expect(isKnownCode(42)).toBe(false);
	});

	it('reduces a value to a recognized code or a fixed placeholder', () => {
		expect(loggable('CALLER_STRING')).toBe('[text omitted]');
		expect(loggable('EPIPE')).toBe('EPIPE');
		expect(loggable({ code: 'EPIPE', body: 'x' })).toBe('code=EPIPE');
		expect(loggable({ error: 'state_mismatch' })).toBe('code=state_mismatch');
		expect(loggable({ message: 'free text' })).toBe('[object omitted]');
		expect(loggable(Object.assign(new TypeError('x'), { code: 'ENOENT' }))).toBe(
			'TypeError ENOENT'
		);
		expect(loggable(Object.assign(new Error('x'), { name: 'bad name\n' }))).toBe('Error');
		expect(loggable(null)).toBeNull();
		expect(loggable(7)).toBe(7);
		expect(loggable(() => {})).toBe('[value omitted]');
	});

	it('keeps the fixed part of a message, drops one that holds an address, and flattens controls', () => {
		expect(fixedText('Invalid origin: https://x.example')).toBe('Invalid origin');
		expect(fixedText('See https://x.example/page for more')).toBe('[message omitted]');
		expect(fixedText('Line\nbreak x‮')).toBe('Line break x ');
		expect(fixedText('x'.repeat(300))).toHaveLength(200);
	});
});

describe('redactingLogger', () => {
	const records = () => {
		const spies = (['debug', 'info', 'warn', 'error'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
		return () => spies.flatMap((s) => s.mock.calls.flat());
	};

	it('logs a recognized code and only the fixed text of a message', () => {
		const all = records();
		const logger = redactingLogger(patterns);
		logger.log('error', 'Invalid origin: https://x.example', { code: 'INVALID_ORIGIN' });
		logger.log('error', 'See https://x.example/page for more');
		expect(all()).toEqual([
			'[Better Auth] Invalid origin code=INVALID_ORIGIN',
			'[Better Auth] [message omitted]'
		]);
	});

	it('keeps only a short code from an object, and nothing from a string that is not one', () => {
		const all = records();
		redactingLogger(patterns).log(
			'error',
			'Line\nbreak‮',
			'two words',
			{ code: 'ECONNRESET', body: 'x' },
			{ message: 'free text' }
		);
		expect(all()).toEqual([
			'[Better Auth] Line break  [text omitted] code=ECONNRESET [object omitted]'
		]);
	});

	it('writes debug records to console.debug', () => {
		const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		redactingLogger(patterns).log('debug', 'Hello');
		expect(debug).toHaveBeenCalledWith('[Better Auth] Hello');
	});
});

describe('CONTROL_OR_BIDI', () => {
	it.each([0x0000, 0x001f, 0x007f, 0x009f, 0x202a, 0x202e, 0x2066, 0x2069])(
		'matches U+%s',
		(code) => {
			expect(CONTROL_OR_BIDI.test(String.fromCharCode(code))).toBe(true);
		}
	);

	it('leaves ordinary text, and the line separators that only log lines add, alone', () => {
		for (const text of ['plain text', 'é', ' ', ' ', '⁥', ' ']) {
			expect(CONTROL_OR_BIDI.test(text)).toBe(false);
		}
	});
});

describe('logFailure', () => {
	it('prints where, the class name and a known code only', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const cause = new Error('inner CX-OaV5gtW0OAMlGz72BwwkqueZXgU1hi11UKrLIecc');
		logFailure(
			'sign-in',
			Object.assign(new TypeError('secret message'), { code: 'ECONNRESET', cause })
		);
		logFailure('sign-in', Object.assign(new Error('x'), { code: 'CALLER_TEXT' }));
		logFailure('sign-in', 'free text');
		logFailure('bad\nwhere', null);
		expect(error.mock.calls).toEqual([
			['sign-in TypeError ECONNRESET'],
			['sign-in Error'],
			['sign-in string'],
			['bad where object']
		]);
	});
});
