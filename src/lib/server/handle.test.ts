import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';
import { expect, it, vi } from 'vitest';
import type { App } from './app.ts';
import { createHandle } from './handle.ts';
import { createLocalIdentity } from './identity/index.ts';
import { createInstance } from './instance.ts';
import { createTestDb } from './test-db.ts';

async function setup(options: { local?: boolean } = {}) {
	const db = await createTestDb();
	const instance = await createInstance(db);
	const identity = await createLocalIdentity(db);
	if (options.local) {
		await instance.chooseLocal();
		await identity.ensureLocalLearner();
	}
	const core = { forLearner: (learnerId: string) => ({ learnerId }) } as unknown as App['core'];
	return { db, handle: createHandle({ instance, identity, core }) };
}

function request(path: string, routeId: string | null, method = 'GET') {
	const url = new URL(path, 'http://localhost');
	const locals: Record<string, unknown> = {};
	const event = {
		url,
		route: { id: routeId },
		request: { method },
		cookies: { get: () => undefined },
		locals
	} as unknown as RequestEvent;
	const resolve = vi.fn<ResolveFn>(async () => new Response('page'));
	return { event, locals, resolve };
}

type ResolveFn = (event: RequestEvent, opts?: ResolveOptions) => Promise<Response>;

const call = ({ event, resolve }: ReturnType<typeof request>) => ({ event, resolve });

const framing = {
	'content-security-policy': "frame-ancestors 'none'",
	'x-frame-options': 'DENY'
};

it('on a fresh Instance every page redirects to Setup, with the anti-framing headers', async () => {
	const { handle, db } = await setup();

	for (const [path, routeId] of [
		['/', '/'],
		['/topics/stacks', '/topics/[topicId]'],
		['/problems/p', '/problems/[problemId]'],
		['/settings?reset=confirm', '/settings'],
		['/no/such/page', null]
	] as const) {
		const { event, resolve } = request(path, routeId);
		const response = await handle({ event, resolve });
		expect(response.status, path).toBe(303);
		expect(response.headers.get('location'), path).toBe('/setup');
		expect(Object.fromEntries(response.headers), path).toMatchObject(framing);
		expect(resolve, path).not.toHaveBeenCalled();
	}
	// Nobody was resolved, so no Local Learner was made before Setup.
	expect(await db.learner.count()).toBe(0);
});

it('a state-changing request on a fresh Instance is redirected too, never run', async () => {
	const { handle } = await setup();
	const { event, resolve } = request('/problems/p?/submit', '/problems/[problemId]', 'POST');

	const response = await handle({ event, resolve });

	expect(response.status).toBe(303);
	expect(resolve).not.toHaveBeenCalled();
});

it('Setup itself renders on a fresh Instance, for nobody', async () => {
	const { handle } = await setup();
	const { event, locals, resolve } = request('/setup', '/setup');

	const response = await handle({ event, resolve });

	expect(await response.text()).toBe('page');
	expect(Object.fromEntries(response.headers)).toMatchObject(framing);
	expect(locals.identity).toBeUndefined();
	expect(locals.learning).toBeUndefined();
});

it('a remote call is refused with 404 in every mode, whatever pathname its headers claim', async () => {
	const fresh = await setup();
	const local = await setup({ local: true });
	for (const { handle } of [fresh, local]) {
		for (const [path, routeId] of [
			['/_app/remote/abc/fn', null],
			['/_app/x', null],
			['/setup', '/setup'],
			['/', '/']
		] as const) {
			const { event, resolve } = request(path, routeId, 'POST');
			(event as { isRemoteRequest: boolean }).isRemoteRequest = true;
			const response = await handle({ event, resolve });
			expect(response.status, path).toBe(404);
			expect(Object.fromEntries(response.headers), path).toMatchObject(framing);
			expect(resolve, path).not.toHaveBeenCalled();
		}
	}
});

it('the gate refusals are never cached', async () => {
	const fresh = await setup();
	const local = await setup({ local: true });

	const redirect = await fresh.handle(call(request('/', '/')));
	const notFound = await local.handle(call(request('/signin', '/signin')));

	expect(redirect.headers.get('cache-control')).toBe('no-store');
	expect(notFound.headers.get('cache-control')).toBe('no-store');
});

it('a Local Instance resolves the Local Learner and renders the page', async () => {
	const { handle } = await setup({ local: true });
	const { event, locals, resolve } = request('/', '/');

	const response = await handle({ event, resolve });

	expect(response.status).toBe(200);
	expect(Object.fromEntries(response.headers)).toMatchObject(framing);
	expect(locals.identity).toEqual({ learnerId: 'local', displayName: 'Local', role: 'admin' });
	expect(locals.learning).toEqual({ learnerId: 'local' });
});

it('a Local Instance sends Setup back to the Map', async () => {
	const { handle } = await setup({ local: true });
	const { event, resolve } = request('/setup', '/setup');

	const response = await handle({ event, resolve });

	expect(response.status).toBe(303);
	expect(response.headers.get('location')).toBe('/');
	expect(resolve).not.toHaveBeenCalled();
});

it('a refusal from the gate (Multi-user only pages in Local Mode) is a 404 with the headers', async () => {
	const { handle } = await setup({ local: true });
	const { event, resolve } = request('/signin', '/signin');

	const response = await handle({ event, resolve });

	expect(response.status).toBe(404);
	expect(Object.fromEntries(response.headers)).toMatchObject(framing);
	expect(resolve).not.toHaveBeenCalled();
});

it('a Learner who chose a theme gets it on <html> in the render', async () => {
	const { handle } = await setup({ local: true });
	const { event, resolve } = request('/', '/');
	event.cookies = { get: (name: string) => (name === 'theme' ? 'dark' : undefined) } as never;
	let html = '';
	resolve.mockImplementation(async (_event, opts) => {
		html = opts?.transformPageChunk?.({ html: '<html lang="en">', done: true }) as string;
		return new Response(html);
	});

	await handle({ event, resolve });

	expect(html).toBe('<html lang="en" data-theme="dark">');
});
