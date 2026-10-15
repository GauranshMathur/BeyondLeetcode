import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';
import { expect, it, vi } from 'vitest';
import type { App } from '$lib/server/app';
import { createHandle } from '$lib/server/handle';
import { createAuth } from '$lib/server/identity/auth';
import { createLocalIdentity } from '$lib/server/identity/index';
import { createMultiUserIdentity } from '$lib/server/identity/multi-user';
import { createRegistration } from '$lib/server/identity/registration';
import { createInstance } from '$lib/server/instance';
import { createTestDb } from '$lib/server/test-db';

// /signup is judged by the gate (gate.ts) before the page or its action runs. These tests pin what the
// gate answers for it, through the real hook, so the Sign up code never has to guard against them.

type ResolveFn = (event: RequestEvent, opts?: ResolveOptions) => Promise<Response>;

async function app(mode: 'local' | 'multi' | null) {
	const db = await createTestDb();
	const instance = await createInstance(db);
	const identity = await createLocalIdentity(db);
	let multiUser: App['multiUser'] = null;
	if (mode === 'local') {
		await instance.chooseLocal();
		await identity.ensureLocalLearner();
	}
	if (mode === 'multi') {
		await instance.chooseMulti();
		const auth = createAuth({
			db,
			origin: 'http://localhost:3000',
			secret: 'test-secret-test-secret-test-secret-0123',
			admitSignUp: createRegistration({ instance })
		});
		multiUser = { auth, identity: createMultiUserIdentity(auth) };
	}
	const core = { forLearner: (learnerId: string) => ({ learnerId }) } as unknown as App['core'];
	const setup = { multiUser: { kind: 'later' }, createFirstAdmin: vi.fn() } as App['setup'];
	return createHandle({ instance, identity, core, multiUser, setup });
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
	'a Multi-user Instance lets a signed-out visitor reach the page with Better Auth on locals (%s)',
	async (method) => {
		const handle = await app('multi');
		const { event, locals, resolve } = visit(method);

		const response = await handle({ event, resolve });

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
		expect(locals.auth).toBeDefined();
		expect(locals.identity).toBeUndefined();
	}
);
