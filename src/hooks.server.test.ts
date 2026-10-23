import { spawnSync } from 'node:child_process';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/app', () => ({ createApp: vi.fn() }));

const { formatServerError, handleError } = await import('./hooks.server.ts');
const { installLogRedaction } = await import('$lib/server/identity/auth');

afterEach(() => vi.restoreAllMocks());

const token = 'CX-OaV5gtW0OAMlGz72BwwkqueZXgU1hi11UKrLIecc';
const event = (id: string | null) =>
	({
		request: { method: 'POST' },
		route: { id },
		url: new URL(`http://localhost/invite/${token}`)
	}) as never;

describe('what an unexpected error logs', () => {
	it('names the route, never the pathname, and keeps the stack for diagnostics', () => {
		const error = new Error('boom');

		const text = formatServerError(500, error, event('/invite/[token]'));

		expect(text).toContain('[500] POST /invite/[token]');
		expect(text).not.toContain(token);
		expect(text).toContain(error.stack?.split('\n')[1].trim());
	});

	it('redacts an invite path that the error or its stack carries', () => {
		const error = new Error(`failed for /invite/${token}?x=1`);
		error.stack = `Error: failed\n    at fetch (http://localhost/invite/${token})`;

		const text = formatServerError(500, error, event('/invite/[token]'));

		expect(text).not.toContain(token);
		expect(text).toContain('/invite/[redacted]');
	});

	it('writes one line for an unmatched path and handles a thrown non-Error', () => {
		expect(formatServerError(404, new Error('x'), event(null))).toBe('[404] POST (no route)');
		expect(formatServerError(500, `/invite/${token}`, event(null))).not.toContain(token);
	});

	it('logs no token through the handler, and returns the generic message', () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);

		const result = handleError({
			error: new Error(`Failed to parse body at /invite/${token}`),
			event: event('/invite/[token]'),
			status: 500,
			message: 'Internal Error'
		});

		const logged = spies
			.flatMap((s) => s.mock.calls.flat())
			.map((arg) => inspect(arg, { depth: null }))
			.join('\n');
		expect(logged).toContain('/invite/[redacted]');
		expect(logged).not.toContain(token);
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
		installLogRedaction(target as unknown as Console);

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
		installLogRedaction(target as unknown as Console);

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
		installLogRedaction(target as unknown as Console);
		const once = target.error;
		installLogRedaction(target as unknown as Console);

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
		const auth = new URL('./lib/server/identity/auth.ts', import.meta.url).pathname;
		const script = `
			import { installLogRedaction } from ${JSON.stringify(auth)};
			installLogRedaction();
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
			console.time('/invite/' + t); console.timeLog('/invite/' + t, 'beyondleetcode_invite=' + t, { url: '/invite/' + t }); console.timeLog('/invite/' + t, '/invite/', t); console.timeLog('/invite/' + t, 'beyondleetcode_invite=%s', t); console.timeEnd('/invite/' + t);
			if (typeof console.write === 'function') {
				console.write('/invite/' + t + '\\n');
				console.write(new TextEncoder().encode('beyondleetcode_invite=' + t + '\\n'));
				console.write('/invite/', t, '\\n');
				console.write(new TextEncoder().encode('/invite/' + t + '\\n'));
				console.write(new TextEncoder().encode('/invite/' + t), '\\n');
				console.write(new TextEncoder().encode('beyondleetcode_invite=' + t).buffer, 'x\\n');
				console.write(new TextEncoder().encode('beyondleetcode_invite=' + t).buffer);
				console.write('beyondleetcode_invite=%s', t, '\\n');
			}
		`;
		const run = spawnSync('bun', ['-e', script], { encoding: 'utf8' });
		const bytes = `${run.stdout}${run.stderr}`;
		expect(run.status).toBe(0);
		expect(bytes).not.toContain(token);
		expect(bytes).not.toContain('\u001b[32m'.concat(token));
		expect(bytes).toContain('/invite/[redacted]');
		expect(bytes).toContain('beyondleetcode_invite=[redacted]');
		expect(bytes).toContain('outer');
		// Counters and timers still work: the second count is 2, a timer is found by its label.
		expect(bytes).toContain('plain: 2');
		expect(bytes).not.toMatch(/No such label|does not exist/i);
	});
});
