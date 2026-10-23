import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/app', () => ({ createApp: vi.fn() }));

const { formatServerError, handleError, installLogRedaction } = await import('./hooks.server.ts');

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
	const methods = ['error', 'warn', 'info', 'log'] as const;
	const cookie = `beyondleetcode_invite=${token}`;
	const leaky = () => {
		const cause = new Error(`inner GET /invite/${token}`);
		const error = new Error(`outer ${cookie}`, { cause });
		error.stack = `Error: outer\n    at x (http://localhost/invite/${token}; ${cookie})`;
		return error;
	};
	const printed = (spy: { mock: { calls: unknown[][] } }) =>
		spy.mock.calls
			.flat()
			.map((arg) => inspect(arg, { depth: null }))
			.join('\n');

	const fakeConsole = () =>
		({
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			log: vi.fn()
		}) as unknown as Console & Record<(typeof methods)[number], ReturnType<typeof vi.fn>>;

	it.each(methods)(
		'console.%s from code that uses none of our loggers prints no token',
		(method) => {
			const target = fakeConsole();
			const spy = target[method];
			installLogRedaction(target);

			target[method](leaky());
			target[method](`plain /invite/${token}`, { url: `/invite/${token}`, cookie }, 42);

			const out = printed(spy);
			expect(out).not.toContain(token);
			expect(out).toContain('/invite/[redacted]');
			expect(out).toContain('beyondleetcode_invite=[redacted]');
			expect(out).toContain('outer');
			expect(out).toContain('42');
		}
	);

	it('does not wrap twice', () => {
		const target = fakeConsole();
		const spy = target.error;
		installLogRedaction(target);
		const once = target.error;
		installLogRedaction(target);

		expect(target.error).toBe(once);
		target.error('x');
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('is installed on the real console when the server hooks load', () => {
		const out = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		console.error(`boom /invite/${token}`);
		expect(printed(out)).not.toContain(token);
	});
});
