import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, type Mock, onTestFinished, vi } from 'vitest';

// The server's private environment, one object the tests change between starts.
const env = vi.hoisted(() => {
	const values: Record<string, string | undefined> = {};
	// The mocked module answers for any name, so a variable the test leaves unset reads as undefined.
	return new Proxy(values, { has: () => true });
});
const captured = vi.hoisted(() => ({
	locals: [] as Record<string, unknown>[],
	/** Set to build the real handle instead of the one that records the locals. */
	real: undefined as ((app: unknown) => unknown) | undefined
}));
vi.mock('$app/env/private', () => env);
vi.mock('#lib/server/app.js', () => ({ createApp: vi.fn() }));
vi.mock('#lib/server/handle.js', () => ({
	createHandle: (app: unknown) =>
		captured.real
			? captured.real(app)
			: async ({ event }: { event: { locals: Record<string, unknown> } }) => {
					captured.locals.push({ ...event.locals });
					return new Response('ok');
				}
}));

const { handle, handleError, init } = await import('./hooks.server.ts');
const { createApp } = await import('#lib/server/app.js');
const { load: layoutLoad } = await import('./routes/+layout.server.ts');
const { createDb } = await import('#lib/server/db.js');
const { INVITE_LOG_PATTERNS } = await import('#lib/server/identity/invites.js');
const { formatServerError, installLogRedaction } = await import('#lib/server/logging.js');
const { ContentError } = await import('#lib/server/content/catalogue.js');

afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
	for (const key of Object.keys(env)) delete env[key];
	captured.locals.length = 0;
	captured.real = undefined;
});

const token = 'CX-OaV5gtW0OAMlGz72BwwkqueZXgU1hi11UKrLIecc';
const event = (id: string | null) =>
	({
		request: { method: 'POST' },
		route: { id },
		url: new URL(`http://localhost/invite/${token}`)
	}) as never;

describe('what an unexpected error logs', () => {
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

	it('logs only that through the handler, and returns the generic message', () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);

		const result = handleError({
			kind: 'unknown',
			error: new Error(`Failed to parse body at /invite/${token}`),
			event: event('/invite/[token]')
		});

		const logged = spies
			.flatMap((s) => s.mock.calls.flat())
			.map((arg) => inspect(arg, { depth: null }))
			.join('\n');
		expect(logged).toContain('[500] POST /invite/[token] Error');
		expect(logged).not.toContain(token);
		expect(logged).not.toMatch(/Failed to parse|at /);
		expect(result).toEqual({ message: 'Internal Error' });
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
		installLogRedaction(INVITE_LOG_PATTERNS, target as unknown as Console);

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
		installLogRedaction(INVITE_LOG_PATTERNS, target as unknown as Console);

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
		installLogRedaction(INVITE_LOG_PATTERNS, target as unknown as Console);
		const once = target.error;
		installLogRedaction(INVITE_LOG_PATTERNS, target as unknown as Console);

		expect(target.error).toBe(once);
		target.error('x');
		target.group();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(group).toHaveBeenCalledWith();
	});

	it('is installed on every printing method of the real console when the server hooks load', () => {
		for (const m of [...printing, 'assert', 'dir', 'table'] as const) {
			expect(
				(console[m] as unknown as Record<symbol, unknown>)[
					Symbol.for('beyondleetcode.redactingConsole')
				]
			).toBe(true);
		}
	});

	it('writes no token to the bytes of a real Bun process, whichever member logs', () => {
		const logging = new URL('./lib/server/logging.ts', import.meta.url).pathname;
		const invites = new URL('./lib/server/identity/invites.ts', import.meta.url).pathname;
		const script = `
			import { installLogRedaction } from ${JSON.stringify(logging)};
			import { INVITE_LOG_PATTERNS } from ${JSON.stringify(invites)};
			installLogRedaction(INVITE_LOG_PATTERNS);
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
		const logging = new URL('./lib/server/logging.ts', import.meta.url).pathname;
		const invites = new URL('./lib/server/identity/invites.ts', import.meta.url).pathname;
		const run = spawnSync('bun', [
			'-e',
			`import { installLogRedaction } from ${JSON.stringify(logging)}; import { INVITE_LOG_PATTERNS } from ${JSON.stringify(invites)}; installLogRedaction(INVITE_LOG_PATTERNS); const t = ${JSON.stringify(token)}; ${script}`
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

describe('dev mode through the server hook', () => {
	async function migratedDatabase(mode?: 'local' | 'multi') {
		const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-hook-'));
		onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
		const url = `file:${join(dir, 'app.db')}`;
		execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
			env: { ...process.env, DATABASE_URL: url },
			stdio: 'pipe'
		});
		if (mode) {
			const db = createDb(url);
			await db.instance.create({ data: { mode } });
			await db.$disconnect();
		}
		return url;
	}

	/** Starts the hook with the real app over a real database, and sends one request through `handle`. */
	async function start(url: string, vars: Record<string, string | undefined>) {
		const actual = await vi.importActual<typeof import('#lib/server/app.js')>('#lib/server/app.js');
		vi.mocked(createApp).mockImplementation(actual.createApp);
		Object.assign(env, {
			CONTENT_DIR: 'src/lib/server/content/fixture',
			DATABASE_URL: url,
			RUNNER_URL: 'http://127.0.0.1:1',
			RUNNER_TOKEN: 'test-token',
			...vars
		});
		await init();
	}
	const request = (headers: Record<string, string> = {}, search = '') =>
		({
			event: {
				locals: {} as Record<string, unknown>,
				request: new Request(`http://localhost/${search}`, { headers })
			},
			resolve: vi.fn()
		}) as never;
	const devModeAfter = async (input = request()) => {
		await handle(input);
		return captured.locals.at(-1)?.devMode;
	};

	it('is true only for DEV_MODE=1 on a Local Instance, and false when unset, empty, 0 or true', async () => {
		const url = await migratedDatabase('local');
		await start(url, { DEV_MODE: '1' });
		expect(await devModeAfter()).toBe(true);

		for (const value of [undefined, '', '0', 'true']) {
			await start(url, { DEV_MODE: value });
			expect(await devModeAfter(), JSON.stringify(value)).toBe(false);
		}
	}, 120_000);

	it('passes the private environment variable on, read when the app is built', async () => {
		vi.mocked(createApp).mockResolvedValue({ devMode: true } as never);
		env.DEV_MODE = '1';
		await init();
		expect(vi.mocked(createApp).mock.calls.at(-1)?.[0]).toMatchObject({ DEV_MODE: '1' });

		// A later change to the environment does not reach a request: the answer is the app's.
		env.DEV_MODE = '0';
		expect(await devModeAfter()).toBe(true);
	});

	it('is the answer of the app itself, not one the hook works out', async () => {
		env.DEV_MODE = '1';
		vi.mocked(createApp).mockResolvedValue({ devMode: false } as never);
		await init();
		expect(await devModeAfter()).toBe(false);
	});

	it('refuses to start a Multi-user Instance with DEV_MODE set, naming the variable', async () => {
		const url = await migratedDatabase('multi');
		await expect(
			start(url, {
				DEV_MODE: '1',
				BETTER_AUTH_SECRET: 'x'.repeat(48),
				ORIGIN: 'http://localhost:4174'
			})
		).rejects.toThrow(/DEV_MODE=1 on a multi-user Instance/);
	}, 60_000);

	it('is false on a fresh Instance that has not chosen a mode, even with DEV_MODE=1', async () => {
		const url = await migratedDatabase();
		await start(url, { DEV_MODE: '1' });
		expect(await devModeAfter()).toBe(false);
	}, 60_000);

	/** The next start builds the real handle, so the gate answers the request. */
	async function useRealHandle() {
		const actual =
			await vi.importActual<typeof import('#lib/server/handle.js')>('#lib/server/handle.js');
		captured.real = actual.createHandle as (app: unknown) => unknown;
	}
	const realRequest = (path: string, routeId: string) => {
		const url = new URL(`http://localhost${path}`);
		const event = {
			locals: {} as Record<string, unknown>,
			url,
			request: new Request(url),
			route: { id: routeId },
			isRemoteRequest: false,
			isDataRequest: false,
			cookies: { get: () => undefined, getAll: () => [] }
		};
		return { event, resolve: vi.fn(async () => new Response('page')) } as never;
	};

	it('gives the same answer when the gate refuses the request, through the real handle', async () => {
		const url = await migratedDatabase('local');
		await useRealHandle();
		await start(url, { DEV_MODE: '1' });
		const input = realRequest('/users', '/users') as unknown as {
			event: { locals: Record<string, unknown> };
		};
		const response = await handle(input as never);
		expect(response?.status).toBe(404);
		expect(input.event.locals.devMode).toBe(true);
	}, 60_000);

	it('does not move for a header, a cookie or a query the request carries', async () => {
		const url = await migratedDatabase('local');
		await start(url, {});
		const input = request(
			{ 'x-dev-mode': '1', 'dev-mode': '1', cookie: 'devMode=1; DEV_MODE=1; dev_mode=1' },
			'?devMode=1&DEV_MODE=1&dev=1'
		);
		expect(await devModeAfter(input)).toBe(false);
	}, 60_000);
});

describe('a ContentError at the error hook', () => {
	const contentEvent = () =>
		({
			request: { method: 'GET' },
			route: { id: '/chapters/[chapterId]' },
			url: new URL('http://localhost/chapters/stacks-undo-log')
		}) as never;
	const issues = ['content.json: not valid JSON', 'topics/x/topic.json: missing file'];
	const spyConsole = () =>
		(['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
	const loggedBy = (spies: ReturnType<typeof spyConsole>) =>
		spies.flatMap((s) => s.mock.calls.map((call) => call.join(' ')));
	const startWith = async (devMode: boolean) => {
		vi.mocked(createApp).mockResolvedValue({ devMode } as never);
		await init();
	};

	it('shows the issues in dev mode, answers no status, and logs only the class name', async () => {
		const spies = spyConsole();
		await startWith(true);

		const result = handleError({
			kind: 'unknown',
			error: new ContentError(issues),
			event: contentEvent()
		});

		expect(result).toEqual({ message: 'Invalid content', contentIssues: issues });
		expect('status' in (result as object)).toBe(false);
		const lines = loggedBy(spies);
		expect(lines).toEqual(['[500] GET /chapters/[chapterId] ContentError']);
	});

	it('answers the generic message with dev mode off, and logs the same line', async () => {
		const spies = spyConsole();
		await startWith(false);

		const result = handleError({
			kind: 'unknown',
			error: new ContentError(issues),
			event: contentEvent()
		});

		expect(result).toEqual({ message: 'Internal Error' });
		expect(loggedBy(spies)).toEqual(['[500] GET /chapters/[chapterId] ContentError']);
	});

	it('shows nothing for an error that is not a ContentError, dev mode or not', async () => {
		spyConsole();
		await startWith(true);
		const named = Object.assign(new Error('x /srv/content'), { name: 'ContentError' });
		const others = [
			new TypeError('cannot read /srv/content/topics'),
			Object.assign(new Error('ENOENT: no such file /srv/content/topics'), { code: 'ENOENT' }),
			named,
			{ issues: ['x'] }
		];

		for (const error of others) {
			const result = handleError({ kind: 'unknown', error, event: contentEvent() });
			expect(result).toEqual({ message: 'Internal Error' });
			expect(result).not.toHaveProperty('contentIssues');
		}
		const notFound = handleError({
			kind: 'framework',
			error: { status: 404, message: 'x' },
			event: contentEvent()
		});
		expect(notFound).toEqual({ message: 'Not Found' });
	});

	it('keeps the generic answer, and one log line, when the issues are not a list of strings', async () => {
		const spies = spyConsole();
		await startWith(true);
		const withIssues = (set: (e: InstanceType<typeof ContentError>) => void) => {
			const error = new ContentError(['a']);
			set(error);
			return error;
		};
		const broken = [
			withIssues((e) => Object.defineProperty(e, 'issues', { value: null })),
			withIssues((e) => Object.defineProperty(e, 'issues', { value: 'a: b' })),
			withIssues((e) => Object.defineProperty(e, 'issues', { value: ['a', 1] })),
			withIssues((e) =>
				Object.defineProperty(e, 'issues', {
					get() {
						throw new Error('/srv/content secret');
					}
				})
			)
		];

		for (const error of broken) {
			const result = handleError({ kind: 'unknown', error, event: contentEvent() });
			expect(result).toEqual({ message: 'Internal Error' });
		}
		expect(loggedBy(spies)).toEqual(
			broken.map(() => '[500] GET /chapters/[chapterId] ContentError')
		);
	});

	it('stays generic, with one log line and no throw, for values only a Proxy or a subclass can make', async () => {
		const spies = spyConsole();
		await startWith(true);
		const withIssues = (value: unknown) =>
			Object.defineProperty(new ContentError(['a']), 'issues', { value });
		let reads = 0;
		const flipping = new Proxy(['a: b'], {
			get(target, key, receiver) {
				if (key === '0') {
					reads += 1;
					return reads > 1 ? {} : Reflect.get(target, key, receiver);
				}
				return Reflect.get(target, key, receiver);
			}
		});
		class Sneaky extends Array<string> {
			override slice(): string[] {
				return ['/srv/content/secret'];
			}
		}
		const subclass = Sneaky.from(['a: b']);
		const sparse = new Array<string>(2);
		sparse[0] = 'a: b';
		const protoThrows = new Proxy(new ContentError(['a: b']), {
			getPrototypeOf() {
				throw new Error('/srv/content secret');
			}
		});
		const broken = [protoThrows, withIssues(sparse)];

		for (const error of broken) {
			const result = handleError({ kind: 'unknown', error, event: contentEvent() });
			expect(result).toEqual({ message: 'Internal Error' });
		}
		// Each item is read once, and no method of the source is called: a changing Proxy or a subclass with its
		// own slice gives only the items it held.
		for (const issues of [flipping, subclass]) {
			const result = handleError({
				kind: 'unknown',
				error: withIssues(issues),
				event: contentEvent()
			});
			expect(result).toEqual({ message: 'Invalid content', contentIssues: ['a: b'] });
		}
		expect(reads).toBe(1);
		// The Proxy hides its class from the logger, which then names only the type; no message is logged.
		expect(loggedBy(spies)).toEqual([
			'[500] GET /chapters/[chapterId] object',
			...[sparse, flipping, subclass].map(() => '[500] GET /chapters/[chapterId] ContentError')
		]);
	});

	it.each([201, 1000])(
		'lists the first 200 of %i issues and then how many are left',
		async (count) => {
			spyConsole();
			await startWith(true);
			const all = Array.from({ length: count }, (_, i) => `topics/t${i}/topic.json: missing file`);

			const result = handleError({
				kind: 'unknown',
				error: new ContentError(all),
				event: contentEvent()
			});

			expect((result as { contentIssues?: string[] }).contentIssues).toEqual([
				...all.slice(0, 200),
				`and ${count - 200} more`
			]);
		}
	);

	it('lists exactly 200 issues as they are', async () => {
		spyConsole();
		await startWith(true);
		const all = Array.from({ length: 200 }, (_, i) => `x${i}: y`);

		const result = handleError({
			kind: 'unknown',
			error: new ContentError(all),
			event: contentEvent()
		});

		expect((result as { contentIssues?: string[] }).contentIssues).toEqual(all);
	});

	describe('through the real app', () => {
		async function reject() {
			const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-content-'));
			onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
			const content = join(dir, 'content');
			cpSync('src/lib/server/content/fixture', content, { recursive: true });
			const chapter = join(content, 'topics/stacks/chapters/stacks-undo-log/chapter.md');
			const original = readFileSync(chapter, 'utf8');

			const dbDir = mkdtempSync(join(tmpdir(), 'beyondleetcode-hook-'));
			onTestFinished(() => rmSync(dbDir, { recursive: true, force: true }));
			const url = `file:${join(dbDir, 'app.db')}`;
			execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
				env: { ...process.env, DATABASE_URL: url },
				stdio: 'pipe'
			});
			const db = createDb(url);
			await db.instance.create({ data: { mode: 'local' } });
			await db.$disconnect();

			const actual =
				await vi.importActual<typeof import('#lib/server/app.js')>('#lib/server/app.js');
			vi.mocked(createApp).mockImplementation(actual.createApp);
			Object.assign(env, {
				CONTENT_DIR: content,
				DATABASE_URL: url,
				RUNNER_URL: 'http://127.0.0.1:1',
				RUNNER_TOKEN: 'test-token',
				DEV_MODE: '1'
			});
			await init();
			const app = (await vi.mocked(createApp).mock.results.at(-1)?.value) as {
				core: { forLearner(id: string): { chapter(id: string): Promise<unknown> } };
			};
			const view = () => app.core.forLearner('local').chapter('stacks-undo-log');
			// Dev mode checks the folder at start and again for each view, so the file breaks after the start.
			writeFileSync(chapter, '   \n');
			const error = await view().then(
				() => undefined,
				(e: unknown) => e
			);
			return { dir, error, view, mend: () => writeFileSync(chapter, original) };
		}

		it('turns a blanked chapter into its issue in dev mode, and heals when the file is fixed', async () => {
			const spies = spyConsole();
			const { dir, error, view, mend } = await reject();

			const result = handleError({ kind: 'unknown', error, event: contentEvent() });

			expect(result).toEqual({
				message: 'Invalid content',
				contentIssues: ['topics/stacks/chapters/stacks-undo-log/chapter.md: must not be empty']
			});
			expect(JSON.stringify(result)).not.toContain(dir);
			expect(loggedBy(spies)).toEqual(['[500] GET /chapters/[chapterId] ContentError']);
			mend();
			await expect(view()).resolves.toBeDefined();
		}, 60_000);

		it('gives the generic message for the same error when dev mode is off', async () => {
			const spies = spyConsole();
			const { error } = await reject();
			await startWith(false);

			const result = handleError({ kind: 'unknown', error, event: contentEvent() });

			expect(result).toEqual({ message: 'Internal Error' });
			expect(loggedBy(spies)).toEqual(['[500] GET /chapters/[chapterId] ContentError']);
		}, 60_000);
	});
});

describe('what the root layout sends about dev mode', () => {
	const loadWith = (devMode: boolean) =>
		layoutLoad({
			locals: { devMode, instance: { mode: () => 'local' } },
			route: { id: '/' },
			url: new URL('http://localhost/')
		} as never) as unknown as Record<string, unknown>;

	it('has no devMode key at all when the switch is off, not even false', () => {
		const data = loadWith(false);
		expect('devMode' in data).toBe(false);
		expect(JSON.stringify(data)).not.toMatch(/dev/i);
	});

	it('carries devMode: true when the switch is on', () => {
		expect(loadWith(true).devMode).toBe(true);
	});
});
