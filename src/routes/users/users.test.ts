import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import type { App } from '$lib/server/app';
import type { Db } from '$lib/server/db';
import { createHandle } from '$lib/server/handle';
import { createAuth } from '$lib/server/identity/auth';
import { createLocalIdentity } from '$lib/server/identity/index';
import { createInvites } from '$lib/server/identity/invites';
import { createMultiUserIdentity } from '$lib/server/identity/multi-user';
import { createRegistration } from '$lib/server/identity/registration';
import { createFirstAdmin } from '$lib/server/identity/setup';
import { createInstance, type Instance, RegistrationNotAvailableError } from '$lib/server/instance';
import { deleteLearner } from '$lib/server/learning/progress';
import { createFileTestDb } from '$lib/server/test-db';
import { load as layoutLoad } from '../+layout.server';
import { load as signupLoad } from '../signup/+page.server';
import { actions, load } from './+page.server';

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

	const invites = createInvites({ db, origin: 'http://localhost:3000' });
	const core = { forLearner: (learnerId: string) => ({ learnerId }) } as unknown as App['core'];
	const setupPort = { multiUser: { kind: 'open' }, createFirstAdmin: vi.fn() } as App['setup'];
	const handle = createHandle({
		instance,
		identity: await createLocalIdentity(db),
		core,
		multiUser: { auth, identity: createMultiUserIdentity(auth), invites },
		setup: setupPort
	});
	return { db, auth, instance, admin, learner, handle, invites };
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

/** Posts the Registration form through the real hook; the page's action runs where SvelteKit would run it. */
async function submit(
	handle: ReturnType<typeof createHandle>,
	cookie: string,
	fields: Record<string, string>,
	routeId = '/users'
) {
	const resolve = vi.fn(async (event: RequestEvent, _opts?: ResolveOptions) => {
		const result = await actions.registration(event as never);
		return Response.json(result ?? null, { status: result?.status ?? 200 });
	});
	const event = {
		url: new URL('/users?/registration', 'http://localhost'),
		route: { id: routeId },
		request: new Request('http://localhost/users?/registration', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				...(cookie ? { cookie } : {})
			},
			body: new URLSearchParams(fields)
		}),
		cookies: { get: () => undefined, set: vi.fn() },
		locals: {}
	} as unknown as RequestEvent;
	const response = await handle({ event, resolve });
	return { response, resolve };
}

const storedRegistration = async (db: Db) =>
	(await db.instance.findUniqueOrThrow({ where: { id: 'instance' } })).registrationMode;

describe('the Users page in Multi-user Mode', () => {
	it('shows the admin every Account, and is never cached', async () => {
		const { handle, admin, learner } = await setup();
		await learner('Lin Learner', 'lin@example.com');
		await learner('Max Learner', 'max@example.com');

		const { response } = await visit(handle, '/users', admin);

		expect(response.status).toBe(200);
		const { accounts } = await response.json();
		expect(accounts.map((a: { email: string }) => a.email)).toEqual([
			'ada@example.com',
			'lin@example.com',
			'max@example.com'
		]);
		expect(accounts.map((a: { you: boolean }) => a.you)).toEqual([true, false, false]);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('sets no-store in the hook, whatever the route answers, so a route never sets it twice', async () => {
		const { handle, admin } = await setup();
		for (const status of [200, 500]) {
			const event = {
				url: new URL('/users', 'http://localhost'),
				route: { id: '/users' },
				request: { method: 'POST', headers: new Headers({ cookie: admin }) },
				cookies: { get: () => undefined, set: vi.fn() },
				locals: {}
			} as unknown as RequestEvent;
			const resolve = vi.fn(async () => new Response('x', { status }));
			const response = await handle({ event, resolve });
			expect(response.headers.get('cache-control'), `${status}`).toBe('no-store');
		}
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

describe('the Registration switch', () => {
	it('shows the admin the Registration Mode the Instance holds', async () => {
		const { handle, admin, instance } = await setup();

		const invite = await (await visit(handle, '/users', admin)).response.json();
		await instance.setRegistrationMode('open');
		const open = await (await visit(handle, '/users', admin)).response.json();

		expect(invite.registration).toBe('invite');
		expect(open.registration).toBe('open');
	});

	it('opens sign-up on the next request and closes it again on the one after, with no restart', async () => {
		const { handle, admin, auth, instance, db } = await setup();
		const signUp = (email: string) =>
			auth.api.signUpEmail({ body: { name: 'Newcomer', email, password } });
		const signupPage = () => signupLoad({ locals: { instance } } as never);
		// A new Instance starts invite-only: the page is closed and the hook refuses an Account.
		expect(await signupPage()).toEqual({ open: false });
		await expect(signUp('first@example.com')).rejects.toMatchObject({ statusCode: 403 });

		const toOpen = await submit(handle, admin, { registration: 'open' });

		expect(toOpen.response.status).toBe(200);
		expect(await storedRegistration(db)).toBe('open');
		expect(await signupPage()).toEqual({ open: true });
		await expect(signUp('second@example.com')).resolves.toBeDefined();

		const toInvite = await submit(handle, admin, { registration: 'invite' });

		expect(toInvite.response.status).toBe(200);
		expect(await storedRegistration(db)).toBe('invite');
		expect(await signupPage()).toEqual({ open: false });
		await expect(signUp('third@example.com')).rejects.toMatchObject({ statusCode: 403 });
		expect(await db.user.findUnique({ where: { email: 'third@example.com' } })).toBeNull();
		expect(await db.user.findUnique({ where: { email: 'second@example.com' } })).not.toBeNull();
	});

	it('refuses a learner with 403 before the action runs, and changes nothing', async () => {
		const { handle, learner, instance, db } = await setup();
		const lin = await learner('Lin Learner', 'lin@example.com');

		const { response, resolve } = await submit(handle, lin, { registration: 'open' });

		expect(response.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
		expect(instance.registrationMode()).toBe('invite');
		expect(await storedRegistration(db)).toBe('invite');
	});

	it('refuses a user whose stored role merely contains admin with 403', async () => {
		const { handle, learner, instance, db } = await setup();
		const sam = await learner('Sam Sneaky', 'sam@example.com');
		await db.user.update({ where: { email: 'sam@example.com' }, data: { role: 'admin,learner' } });

		const { response, resolve } = await submit(handle, sam, { registration: 'open' });

		expect(response.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
		expect(instance.registrationMode()).toBe('invite');
		expect(await storedRegistration(db)).toBe('invite');
	});

	it('sends a signed-out visitor to Sign in and changes nothing', async () => {
		const { handle, instance, db } = await setup();

		const { response, resolve } = await submit(handle, '', { registration: 'open' });

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toMatch(/^\/signin\?next=/);
		expect(resolve).not.toHaveBeenCalled();
		expect(instance.registrationMode()).toBe('invite');
		expect(await storedRegistration(db)).toBe('invite');
	});

	it('treats an admin whose session was ended as signed out', async () => {
		const { handle, admin, instance, db } = await setup();
		await db.session.deleteMany();

		const { response, resolve } = await submit(handle, admin, { registration: 'open' });

		expect(response.status).toBe(303);
		expect(resolve).not.toHaveBeenCalled();
		expect(instance.registrationMode()).toBe('invite');
	});

	it.each([
		['something else', { registration: 'everyone' }],
		['the page label instead of the value', { registration: 'Open' }],
		['nothing', {}],
		['an empty value', { registration: '' }]
	])('refuses %s with 400 and changes nothing', async (_, fields) => {
		const { handle, admin, instance, db } = await setup();

		const { response } = await submit(handle, admin, fields);

		expect(response.status).toBe(400);
		expect(instance.registrationMode()).toBe('invite');
		expect(await storedRegistration(db)).toBe('invite');
	});

	it('answers a failed write with a fixed message and leaves the mode as it was', async () => {
		const { handle, admin, instance, db } = await setup();
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(instance, 'setRegistrationMode').mockRejectedValueOnce(
			new Error('SQLITE_FULL: /var/lib/beyondleetcode/app.db')
		);

		const { response } = await submit(handle, admin, { registration: 'open' });

		expect(response.status).toBe(500);
		const body = JSON.stringify(await response.json());
		expect(body).toContain('could not be changed');
		expect(body).not.toMatch(/SQLITE|beyondleetcode\/app\.db/);
		expect(instance.registrationMode()).toBe('invite');
		expect(await storedRegistration(db)).toBe('invite');
		// The log names the kind of failure, never the message with its paths.
		expect(JSON.stringify(logged.mock.calls)).not.toContain('/var/lib');
	});

	it('does not exist in Local Mode: 404 for the Local Learner, who is an admin there, and nothing changes', async () => {
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

		const { response, resolve } = await submit(handle, '', { registration: 'open' });

		expect(response.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
		expect(instance.registrationMode()).toBe('invite');
		expect(await storedRegistration(db)).toBe('invite');
	});
});

describe('the Registration action, if the hook ever let a request through', () => {
	const admin = { learnerId: 'l', displayName: 'N', role: 'admin' as const };
	const learner = { ...admin, role: 'learner' as const };
	const request = (formData = vi.fn(async () => new URLSearchParams({ registration: 'open' }))) =>
		({ formData }) as unknown as Request;
	const instance = () => ({ setRegistrationMode: vi.fn(async () => {}) });
	const call = (locals: Record<string, unknown>, req: Request) =>
		actions.registration({ locals, request: req } as never);

	it('is 403 for a learner, before it reads the form or touches the Instance', async () => {
		const i = instance();
		const formData = vi.fn();

		await expect(
			call({ auth: {}, identity: learner, instance: i }, request(formData as never))
		).rejects.toMatchObject({ status: 403 });

		expect(formData).not.toHaveBeenCalled();
		expect(i.setRegistrationMode).not.toHaveBeenCalled();
	});

	it('is 403 for nobody', async () => {
		const i = instance();

		await expect(call({ auth: {}, instance: i }, request())).rejects.toMatchObject({ status: 403 });

		expect(i.setRegistrationMode).not.toHaveBeenCalled();
	});

	it('is 403 for any role that is not admin exactly', async () => {
		const i = instance();
		const odd = { ...admin, role: 'admin,learner' as never };

		await expect(call({ auth: {}, identity: odd, instance: i }, request())).rejects.toMatchObject({
			status: 403
		});

		expect(i.setRegistrationMode).not.toHaveBeenCalled();
	});

	it('is 404 without Better Auth, as in Local Mode where the Local Learner is an admin', async () => {
		const i = instance();

		await expect(call({ identity: admin, instance: i }, request())).rejects.toMatchObject({
			status: 404
		});

		expect(i.setRegistrationMode).not.toHaveBeenCalled();
	});

	it('is 404 when the Instance says it has no Registration Mode to switch', async () => {
		const i = {
			setRegistrationMode: vi.fn(async () => {
				throw new RegistrationNotAvailableError();
			})
		};

		await expect(call({ auth: {}, identity: admin, instance: i }, request())).rejects.toMatchObject(
			{ status: 404 }
		);
	});

	it('hands the Instance only the value from the form', async () => {
		const i = instance();

		await call({ auth: {}, identity: admin, instance: i }, request());

		expect(i.setRegistrationMode).toHaveBeenCalledExactlyOnceWith('open');
	});
});

/** Posts to the Invite actions through the real hook. */
async function post(
	handle: ReturnType<typeof createHandle>,
	cookie: string,
	name: 'invite' | 'cancel' | 'reset' | 'remove',
	fields: Record<string, string> = {},
	/** What the app wiring adds to `locals` beyond the hook (the Learner remover). */
	extraLocals: Record<string, unknown> = {}
) {
	const setHeaders = vi.fn();
	const resolve = vi.fn(async (event: RequestEvent, _opts?: ResolveOptions) => {
		Object.assign(event.locals, extraLocals);
		const result = await actions[name]({ ...event, setHeaders } as never);
		return Response.json(result ?? null, { status: result?.status ?? 200 });
	});
	const event = {
		url: new URL(`/users?/${name}`, 'http://localhost'),
		route: { id: '/users' },
		request: new Request(`http://localhost/users?/${name}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				...(cookie ? { cookie } : {})
			},
			body: new URLSearchParams(fields)
		}),
		cookies: { get: () => undefined, set: vi.fn() },
		locals: {}
	} as unknown as RequestEvent;
	const response = await handle({ event, resolve });
	return { response, resolve, setHeaders };
}

describe('Invites on the Users page', () => {
	it('lets the admin create an Invite: the link is in that one response, the database holds only a hash', async () => {
		const { handle, admin, db } = await setup();

		const { response } = await post(handle, admin, 'invite');

		expect(response.status).toBe(200);
		const text = JSON.stringify(await response.json());
		const link = text.match(/http:\\?\/\\?\/localhost:3000\\?\/invite\\?\/([\w-]{43})/);
		expect(link).toBeTruthy();
		const token = (link as RegExpMatchArray)[1];
		expect(JSON.stringify(await db.invite.findMany())).not.toContain(token);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('lists pending Invites in the load, without any token', async () => {
		const { handle, admin, invites } = await setup();
		const made = await invites.create({
			who: { learnerId: 'local', displayName: 'Ada', role: 'admin' },
			now: new Date()
		});

		const { response } = await visit(handle, '/users', admin);

		const body = await response.json();
		expect(body.pending).toEqual([expect.objectContaining({ id: made.id })]);
		expect(JSON.stringify(body)).not.toContain(made.token);
	});

	it('cancels a pending Invite; the cancelled link no longer works', async () => {
		const { handle, admin, invites } = await setup();
		const made = await invites.create({
			who: { learnerId: 'local', displayName: 'Ada', role: 'admin' },
			now: new Date()
		});

		const { response } = await post(handle, admin, 'cancel', { id: made.id });

		expect(response.status).toBe(200);
		expect(await invites.lookup(made.token, new Date())).toBeNull();
	});

	it.each([
		['an unknown id', { id: 'nope' }],
		['no id', {}]
	])('answers %s with a fixed message', async (_, fields) => {
		const { handle, admin } = await setup();

		const { response } = await post(handle, admin, 'cancel', fields);

		expect(response.status).toBe(404);
		expect(JSON.stringify(await response.json())).toContain('no longer pending');
	});

	it.each(['invite', 'cancel'] as const)(
		'%s: refuses a learner with 403 and writes nothing',
		async (name) => {
			const { handle, learner, db, invites } = await setup();
			const lin = await learner('Lin Learner', 'lin@example.com');
			const made = await invites.create({
				who: { learnerId: 'local', displayName: 'Ada', role: 'admin' },
				now: new Date()
			});

			const { response, resolve } = await post(handle, lin, name, { id: made.id });

			expect(response.status).toBe(403);
			expect(resolve).not.toHaveBeenCalled();
			expect(await db.invite.count()).toBe(1);
		}
	);

	it.each(['invite', 'cancel'] as const)(
		'%s: sends a signed-out request to Sign in',
		async (name) => {
			const { handle, db } = await setup();

			const { response, resolve } = await post(handle, '', name, { id: 'x' });

			expect(response.status).toBe(303);
			expect(resolve).not.toHaveBeenCalled();
			expect(await db.invite.count()).toBe(0);
		}
	);

	it.each(['invite', 'cancel'] as const)('%s: does not exist in Local Mode', async (name) => {
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

		const { response, resolve } = await post(handle, '', name, { id: 'x' });

		expect(response.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
		expect(await db.invite.count()).toBe(0);
	});

	it.each(['invite', 'cancel'] as const)(
		'%s: is 403 for a non-admin, 404 without Invites, even past the hook',
		async (name) => {
			const learner = { learnerId: 'l', displayName: 'N', role: 'learner' as const };
			const admin = { ...learner, role: 'admin' as const };
			const event = (locals: Record<string, unknown>) =>
				({ locals, setHeaders: vi.fn(), request: { formData: vi.fn() } }) as never;
			await expect(actions[name](event({ identity: learner, invites: {} }))).rejects.toMatchObject({
				status: 403
			});
			await expect(actions[name](event({}))).rejects.toMatchObject({ status: 403 });
			await expect(actions[name](event({ identity: admin }))).rejects.toMatchObject({
				status: 404
			});
		}
	);
});

describe('Reset password on the Users page', () => {
	async function withLin() {
		const s = await setup();
		const lin = await s.learner('Lin Learner', 'lin@example.com');
		const row = await s.db.user.findUniqueOrThrow({ where: { email: 'lin@example.com' } });
		return { ...s, lin, linId: row.id };
	}

	it('answers once with a one-time password that signs in; the old password and sessions stop', async () => {
		const { handle, admin, auth, lin, linId } = await withLin();

		const { response } = await post(handle, admin, 'reset', { id: linId });

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		const fresh = await response.clone().json();
		expect(fresh.reset).toEqual({ userId: linId, password: expect.any(String) });
		await expect(
			auth.api.signInEmail({ body: { email: 'lin@example.com', password } })
		).rejects.toThrow();
		const signedIn = await auth.api.signInEmail({
			body: { email: 'lin@example.com', password: fresh.reset.password }
		});
		expect(signedIn.user.email).toBe('lin@example.com');
		expect(await auth.api.getSession({ headers: new Headers({ cookie: lin }) })).toBeNull();
	});

	it('flags the user to set a new password', async () => {
		const { handle, admin, db, linId } = await withLin();

		await post(handle, admin, 'reset', { id: linId });

		const lin = await db.user.findUniqueOrThrow({ where: { id: linId } });
		expect(lin.mustChangePassword).toBe(true);
	});

	it('never returns the password from a later load, and never logs it', async () => {
		const { handle, admin, linId } = await withLin();
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);

		const { response } = await post(handle, admin, 'reset', { id: linId });
		const shown = (await response.json()).reset.password as string;
		const after = JSON.stringify(await (await visit(handle, '/users', admin)).response.json());

		expect(after).not.toContain(shown);
		for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(shown);
		vi.restoreAllMocks();
	});

	it('answers an unknown or missing id with a fixed message and changes nothing', async () => {
		const { handle, admin, auth } = await withLin();

		for (const fields of [{ id: 'nope' }, {} as Record<string, string>]) {
			const { response } = await post(handle, admin, 'reset', fields);
			expect(response.status).toBe(404);
			expect(JSON.stringify(await response.json())).toContain('no longer exists');
		}
		await auth.api.signInEmail({ body: { email: 'lin@example.com', password } });
	});

	it('refuses the admin resetting themselves, and keeps their session', async () => {
		const { handle, admin, db, auth } = await withLin();
		const ada = await db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });

		const { response } = await post(handle, admin, 'reset', { id: ada.id });

		expect(response.status).toBe(400);
		expect(await auth.api.getSession({ headers: new Headers({ cookie: admin }) })).not.toBeNull();
		await auth.api.signInEmail({ body: { email: 'ada@example.com', password } });
	});

	it('refuses a learner with 403 before the action runs, and changes nothing', async () => {
		const { handle, lin, linId, auth } = await withLin();
		const max = lin;

		const { response, resolve } = await post(handle, max, 'reset', { id: linId });

		expect(response.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
		await auth.api.signInEmail({ body: { email: 'lin@example.com', password } });
	});

	it('sends a signed-out request to Sign in', async () => {
		const { handle, linId } = await withLin();

		const { response, resolve } = await post(handle, '', 'reset', { id: linId });

		expect(response.status).toBe(303);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('is 403 for a non-admin and 404 without Better Auth, even past the hook, before the form is read', async () => {
		const learner = { learnerId: 'l', displayName: 'N', role: 'learner' as const };
		const admin = { ...learner, role: 'admin' as const };
		const formData = vi.fn();
		const event = (locals: Record<string, unknown>) =>
			({ locals, request: { formData, headers: new Headers() } }) as never;
		await expect(actions.reset(event({ identity: learner, auth: {} }))).rejects.toMatchObject({
			status: 403
		});
		await expect(actions.reset(event({}))).rejects.toMatchObject({ status: 403 });
		await expect(actions.reset(event({ identity: admin }))).rejects.toMatchObject({ status: 404 });
		expect(formData).not.toHaveBeenCalled();
	});

	it('answers a failed reset with a fixed message and no password', async () => {
		const { handle, admin, auth, linId } = await withLin();
		vi.spyOn((await auth.$context).internalAdapter, 'deleteUserSessions').mockRejectedValueOnce(
			new Error('/secret/path')
		);
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { response } = await post(handle, admin, 'reset', { id: linId });

		expect(response.status).toBe(500);
		const text = JSON.stringify(await response.json());
		expect(text).not.toContain('/secret/path');
		expect(text).not.toMatch(/[A-Za-z0-9]{20}/);
		expect(JSON.stringify(quiet.mock.calls)).not.toContain('/secret/path');
		vi.restoreAllMocks();
	});
});

describe('Remove on the Users page', () => {
	async function withLin() {
		const s = await setup();
		const lin = await s.learner('Lin Learner', 'lin@example.com');
		const max = await s.learner('Max Learner', 'max@example.com');
		const row = await s.db.user.findUniqueOrThrow({ where: { email: 'lin@example.com' } });
		const maxRow = await s.db.user.findUniqueOrThrow({ where: { email: 'max@example.com' } });
		const wiring = { deleteLearner: (id: string) => deleteLearner(s.db, id) };
		return {
			...s,
			lin,
			max,
			linId: row.id,
			linLearner: row.learnerId,
			maxLearner: maxRow.learnerId,
			wiring
		};
	}
	const remove = (s: Awaited<ReturnType<typeof withLin>>, cookie: string, id: string) =>
		post(s.handle, cookie, 'remove', { id }, s.wiring);

	it('removes the Account and its progress; another Learner keeps theirs; the answer is never cached', async () => {
		const s = await withLin();
		for (const learnerId of [s.linLearner, s.maxLearner]) {
			await s.db.chapterRead.create({ data: { learnerId, chapterId: 'c' } });
		}

		const { response } = await remove(s, s.admin, s.linId);

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ removed: true });
		await expect(
			s.auth.api.signInEmail({ body: { email: 'lin@example.com', password } })
		).rejects.toThrow();
		expect(await s.auth.api.getSession({ headers: new Headers({ cookie: s.lin }) })).toBeNull();
		expect(await s.db.chapterRead.count({ where: { learnerId: s.linLearner } })).toBe(0);
		expect(await s.db.learner.count({ where: { id: s.linLearner } })).toBe(0);
		expect(await s.db.chapterRead.count({ where: { learnerId: s.maxLearner } })).toBe(1);
		await s.auth.api.signInEmail({ body: { email: 'max@example.com', password } });
	});

	it('refuses the admin removing themselves, and keeps everything', async () => {
		const s = await withLin();
		const ada = await s.db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });

		const { response } = await remove(s, s.admin, ada.id);

		expect(response.status).toBe(400);
		expect((await response.json()).data).toEqual({ removeMessage: 'You cannot remove yourself.' });
		expect(
			await s.auth.api.getSession({ headers: new Headers({ cookie: s.admin }) })
		).not.toBeNull();
		expect(await s.db.user.count({ where: { id: ada.id } })).toBe(1);
	});

	it('answers an unknown user with a fixed message', async () => {
		const s = await withLin();

		const { response } = await remove(s, s.admin, 'nobody');

		expect(response.status).toBe(404);
		expect((await response.json()).data).toEqual({ removeMessage: 'That user no longer exists.' });
	});

	it('refuses a learner with 403 before the action runs, and a signed-out request goes to Sign in', async () => {
		const s = await withLin();

		const learner = await remove(s, s.max, s.linId);
		const signedOut = await remove(s, '', s.linId);

		expect(learner.response.status).toBe(403);
		expect(learner.resolve).not.toHaveBeenCalled();
		expect(signedOut.response.status).toBe(303);
		expect(signedOut.resolve).not.toHaveBeenCalled();
		expect(await s.db.user.count({ where: { id: s.linId } })).toBe(1);
	});

	it('is 403 for a non-admin and 404 without Better Auth or the remover, even past the hook, before the form is read', async () => {
		const learner = { learnerId: 'l', displayName: 'N', role: 'learner' as const };
		const admin = { ...learner, role: 'admin' as const };
		const formData = vi.fn();
		const event = (locals: Record<string, unknown>) =>
			({ locals, request: { formData, headers: new Headers() } }) as never;
		const deleteIt = async () => {};
		await expect(
			actions.remove(event({ identity: learner, auth: {}, deleteLearner: deleteIt }))
		).rejects.toMatchObject({ status: 403 });
		await expect(actions.remove(event({}))).rejects.toMatchObject({ status: 403 });
		await expect(
			actions.remove(event({ identity: admin, deleteLearner: deleteIt }))
		).rejects.toMatchObject({ status: 404 });
		await expect(actions.remove(event({ identity: admin, auth: {} }))).rejects.toMatchObject({
			status: 404
		});
		expect(formData).not.toHaveBeenCalled();
	});

	it('answers a failed removal with a fixed message, and logs only the kind of error', async () => {
		const s = await withLin();
		vi.spyOn((await s.auth.$context).internalAdapter, 'deleteUser').mockRejectedValueOnce(
			new Error('/secret/path')
		);
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { response } = await remove(s, s.admin, s.linId);

		expect(response.status).toBe(500);
		expect((await response.json()).data).toEqual({
			removeMessage: 'The account could not be removed. Try again.'
		});
		expect(JSON.stringify(quiet.mock.calls)).not.toContain('/secret/path');
		expect(await s.db.user.count({ where: { id: s.linId } })).toBe(1);
		vi.restoreAllMocks();
	});

	it('says so when the Account is gone but its progress could not be deleted', async () => {
		const s = await withLin();
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { response } = await post(
			s.handle,
			s.admin,
			'remove',
			{ id: s.linId },
			{
				deleteLearner: async () => {
					throw new Error('/secret/path');
				}
			}
		);

		expect(response.status).toBe(500);
		expect(JSON.stringify(await response.json())).toContain('could not be deleted');
		expect(JSON.stringify(quiet.mock.calls)).not.toContain('/secret/path');
		expect(JSON.stringify(quiet.mock.calls)).toContain('ProgressNotRemovedError');
		expect(await s.db.user.count({ where: { id: s.linId } })).toBe(0);
		vi.restoreAllMocks();
	});

	it('opens the confirm for another Account only: ?remove=<id> in the load, never your own row or an unknown id', async () => {
		const s = await withLin();
		const ada = await s.db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });

		const open = await visit(s.handle, `/users?remove=${s.linId}`, s.admin);
		const own = await visit(s.handle, `/users?remove=${ada.id}`, s.admin);
		const unknown = await visit(s.handle, '/users?remove=nobody', s.admin);
		const none = await visit(s.handle, '/users', s.admin);

		expect((await open.response.json()).confirmingRemove).toBe(s.linId);
		expect((await own.response.json()).confirmingRemove).toBeNull();
		expect((await unknown.response.json()).confirmingRemove).toBeNull();
		expect((await none.response.json()).confirmingRemove).toBeNull();
		expect(open.response.headers.get('cache-control')).toBe('no-store');
	});
});
