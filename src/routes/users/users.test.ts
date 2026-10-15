import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import type { App } from '$lib/server/app';
import { createHandle } from '$lib/server/handle';
import { createAuth } from '$lib/server/identity/auth';
import { createLocalIdentity } from '$lib/server/identity/index';
import { createMultiUserIdentity } from '$lib/server/identity/multi-user';
import { createRegistration } from '$lib/server/identity/registration';
import { createFirstAdmin } from '$lib/server/identity/setup';
import { createInstance, type Instance } from '$lib/server/instance';
import { createFileTestDb } from '$lib/server/test-db';
import { load as layoutLoad } from '../+layout.server';
import { load } from './+page.server';

// The Users page, through the real hook and the real Better Auth: who is let in, and what they see.

const secret = 'test-secret-test-secret-test-secret-0123';
const password = 'correct horse battery staple';
const cookieOf = (headers: Headers) =>
	headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');

async function setup() {
	const db = await createFileTestDb();
	const instance = await createInstance(db);
	let open = false;
	const registration = createRegistration({ instance });
	const auth = createAuth({
		db,
		origin: 'http://localhost:3000',
		secret,
		admitSignUp: (attempt) => (open ? {} : registration(attempt))
	});
	const { headers } = await createFirstAdmin(
		{ instance, auth, db },
		{ name: 'Ada Admin', email: 'ada@example.com', password }
	);
	const admin = cookieOf(headers);

	async function learner(name: string, email: string) {
		open = true;
		const signedUp = await auth.api.signUpEmail({
			body: { name, email, password },
			returnHeaders: true
		});
		open = false;
		return cookieOf(signedUp.headers);
	}

	const core = { forLearner: (learnerId: string) => ({ learnerId }) } as unknown as App['core'];
	const setupPort = { multiUser: { kind: 'open' }, createFirstAdmin: vi.fn() } as App['setup'];
	const handle = createHandle({
		instance,
		identity: await createLocalIdentity(db),
		core,
		multiUser: { auth, identity: createMultiUserIdentity(auth) },
		setup: setupPort
	});
	return { db, auth, instance, admin, learner, handle };
}

/** Runs one request through the hook; the page's load runs where SvelteKit would run it. */
async function visit(
	handle: ReturnType<typeof createHandle>,
	path: string,
	cookie: string,
	routeId = '/users'
) {
	const setHeaders = vi.fn();
	const resolve = vi.fn(async (event: RequestEvent, _opts?: ResolveOptions) => {
		const data = await load({ ...event, setHeaders } as never);
		return Response.json(data);
	});
	const event = {
		url: new URL(path, 'http://localhost'),
		route: { id: routeId },
		request: { method: 'GET', headers: new Headers(cookie ? { cookie } : {}) },
		cookies: { get: () => undefined, set: vi.fn() },
		locals: {}
	} as unknown as RequestEvent;
	const response = await handle({ event, resolve });
	return { response, resolve, setHeaders, locals: event.locals };
}

describe('the Users page in Multi-user Mode', () => {
	it('shows the admin every Account, and is never cached', async () => {
		const { handle, admin, learner } = await setup();
		await learner('Lin Learner', 'lin@example.com');
		await learner('Max Learner', 'max@example.com');

		const { response, setHeaders } = await visit(handle, '/users', admin);

		expect(response.status).toBe(200);
		const { accounts } = await response.json();
		expect(accounts.map((a: { email: string }) => a.email)).toEqual([
			'ada@example.com',
			'lin@example.com',
			'max@example.com'
		]);
		expect(accounts.map((a: { you: boolean }) => a.you)).toEqual([true, false, false]);
		expect(setHeaders).toHaveBeenCalledWith({ 'Cache-Control': 'no-store' });
	});

	it('gives a learner 403 before the page loads', async () => {
		const { handle, learner } = await setup();
		const lin = await learner('Lin Learner', 'lin@example.com');

		const { response, resolve } = await visit(handle, '/users', lin);

		expect(response.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('gives a user whose stored role merely contains admin 403 too', async () => {
		const { handle, learner, db } = await setup();
		const sam = await learner('Sam Sneaky', 'sam@example.com');
		await db.user.update({ where: { email: 'sam@example.com' }, data: { role: 'admin,learner' } });

		const { response, resolve } = await visit(handle, '/users', sam);

		expect(response.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('sends a signed-out visitor to Sign in, remembering the Users page', async () => {
		const { handle } = await setup();

		const { response, resolve } = await visit(handle, '/users', '');

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/signin?next=%2Fusers');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('treats an admin whose session was ended as signed out', async () => {
		const { handle, admin, db } = await setup();
		await db.session.deleteMany();

		const { response, resolve } = await visit(handle, '/users', admin);

		expect(response.status).toBe(303);
		expect(resolve).not.toHaveBeenCalled();
	});
});

describe('the Users page in Local Mode', () => {
	it('does not exist: 404 for the Local Learner, whatever they are', async () => {
		const db = await createFileTestDb();
		const instance = await createInstance(db);
		await instance.chooseLocal();
		const identity = await createLocalIdentity(db);
		await identity.ensureLocalLearner();
		const core = { forLearner: (learnerId: string) => ({ learnerId }) } as unknown as App['core'];
		const handle = createHandle({
			instance,
			identity,
			core,
			multiUser: null,
			setup: { multiUser: { kind: 'later' }, createFirstAdmin: vi.fn() } as App['setup']
		});

		const { response, resolve } = await visit(handle, '/users', '');

		expect(response.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
	});
});

describe('the load, if the hook ever let a request through', () => {
	const event = (locals: Record<string, unknown>) =>
		({ locals, request: { headers: new Headers() }, setHeaders: vi.fn() }) as never;
	const identity = (role: 'admin' | 'learner') => ({ learnerId: 'l', displayName: 'N', role });
	const auth = { api: { listUsers: vi.fn() } };

	it('is 404 without Better Auth, as in Local Mode where the Local Learner is an admin', async () => {
		await expect(load(event({ identity: identity('admin') }))).rejects.toMatchObject({
			status: 404
		});
	});

	it('is 403 for nobody', async () => {
		await expect(load(event({ auth }))).rejects.toMatchObject({ status: 403 });
	});

	it('is 403 for a learner, and reads nothing', async () => {
		await expect(load(event({ auth, identity: identity('learner') }))).rejects.toMatchObject({
			status: 403
		});
		expect(auth.api.listUsers).not.toHaveBeenCalled();
	});
});

describe('the nav', () => {
	const layout = (mode: 'local' | 'multi' | null, role?: 'admin' | 'learner') =>
		layoutLoad({
			locals: {
				instance: { mode: () => mode } as Instance,
				identity: role && { learnerId: 'l', displayName: 'N', role }
			}
		} as never);

	it('offers Users to the admin of a Multi-user Instance', () => {
		expect(layout('multi', 'admin')).toMatchObject({ displayName: 'N', showUsers: true });
	});

	it('does not offer it to a learner', () => {
		expect(layout('multi', 'learner')).toMatchObject({ showUsers: false });
	});

	it('does not offer it in Local Mode, where the Local Learner is an admin but there are no Accounts', () => {
		expect(layout('local', 'admin')).toMatchObject({ displayName: 'N', showUsers: false });
	});

	it('does not offer it before anyone is resolved', () => {
		expect(layout(null)).toMatchObject({ showUsers: false });
		expect(layout('multi')).toMatchObject({ showUsers: false });
	});
});
