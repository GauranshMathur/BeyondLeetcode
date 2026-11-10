import type { RequestEvent } from '@sveltejs/kit';
import type { ResolveOptions } from '@sveltejs/kit/hooks';
import { expect, it, vi } from 'vitest';
import { createTestInstance } from '#lib/server/identity/test-auth.js';

// /signup is judged by the gate (gate.ts) before the page or its action runs. These tests pin what the
// gate answers for it, through the real hook, so the Sign up code never has to guard against them.

type ResolveFn = (event: RequestEvent, opts?: ResolveOptions) => Promise<Response>;

async function app(mode: 'local' | 'multi' | null) {
	const t = await createTestInstance();
	if (mode === 'local') await t.chooseLocal();
	if (mode === 'multi') await t.instance.chooseMulti();
	return t.handle;
}

function visit(method: 'GET' | 'POST') {
	const locals: Record<string, unknown> = {};
	const event = {
		url: new URL('/signup', 'http://localhost'),
		route: { id: '/signup' },
		request: { method, headers: new Headers() },
		cookies: { get: () => undefined, set: vi.fn() },
		locals
	} as unknown as RequestEvent;
	const resolve = vi.fn<ResolveFn>(async () => new Response('page'));
	return { event, locals, resolve };
}

it.each(['GET', 'POST'] as const)(
	'a Local Instance answers %s /signup with 404 and never reaches the page',
	async (method) => {
		const handle = await app('local');
		const { event, resolve } = visit(method);

		const response = await handle({ event, resolve });

		expect(response.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
	}
);

it.each(['GET', 'POST'] as const)(
	'an Instance that is not set up sends %s /signup to Setup and never reaches the page',
	async (method) => {
		const handle = await app(null);
		const { event, resolve } = visit(method);

		const response = await handle({ event, resolve });

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/setup');
		expect(resolve).not.toHaveBeenCalled();
	}
);

it.each(['GET', 'POST'] as const)(
	'a Multi-user Instance lets a signed-out visitor reach the page with the account actions on locals (%s)',
	async (method) => {
		const handle = await app('multi');
		const { event, locals, resolve } = visit(method);

		const response = await handle({ event, resolve });

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
		expect((locals as { multiUser?: { accounts?: unknown } }).multiUser?.accounts).toBeDefined();
		expect(locals.identity).toBeUndefined();
	}
);
