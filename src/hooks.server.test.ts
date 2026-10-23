import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/app', () => ({ createApp: vi.fn() }));

const { formatServerError, handleError } = await import('./hooks.server.ts');

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

		expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain(token);
		expect(result).toEqual({ message: 'Internal Error' });
	});
});
