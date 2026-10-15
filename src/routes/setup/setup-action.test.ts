import { isRedirect } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MultiUserChoice } from '$lib/server/app';
import { InvalidFirstAdminError, MultiUserNotAvailableError } from '$lib/server/identity/setup';
import { createInstance, InstanceAlreadySetUpError } from '$lib/server/instance';
import { createTestDb } from '$lib/server/test-db';
import { actions, load } from './+page.server';

afterEach(() => vi.restoreAllMocks());

type Form = Record<string, string>;

function formOf(values: Form) {
	const body = new FormData();
	for (const [key, value] of Object.entries(values)) body.set(key, value);
	return body;
}

async function run(
	action: (typeof actions)['mode'] | (typeof actions)['admin'],
	values: Form,
	locals: Record<string, unknown>,
	cookies: { set: (...args: unknown[]) => void } = { set: vi.fn() }
) {
	const event = { request: { formData: async () => formOf(values) }, locals, cookies };
	try {
		return await action(event as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

const setupWith = (
	multiUser: MultiUserChoice,
	createFirstAdmin = vi.fn(async () => ({ headers: new Headers() }))
) => ({ multiUser, createFirstAdmin });

const choose = (
	mode: string,
	chooseLocal: () => Promise<void>,
	multiUser: MultiUserChoice = { kind: 'later' }
) => run(actions.mode, { mode }, { instance: { chooseLocal }, setup: setupWith(multiUser) });

describe('step 1: choose a mode', () => {
	it('choosing Local sets the Instance up and redirects to the Map', async () => {
		const chooseLocal = vi.fn(async () => {});

		const result = await choose('local', chooseLocal);

		expect(chooseLocal).toHaveBeenCalledOnce();
		expect(result).toMatchObject({ status: 303, location: '/' });
	});

	it('a choice that lost the race to another one also redirects to the Map', async () => {
		const instance = await createInstance(await createTestDb());
		await instance.chooseLocal();

		const result = await choose('local', () => instance.chooseLocal());

		expect(result).toMatchObject({ status: 303, location: '/' });
	});

	it('any other failure is not hidden behind a redirect', async () => {
		await expect(
			choose('local', async () => Promise.reject(new Error('disk full')))
		).rejects.toThrow('disk full');
	});

	it('Multi-user is refused while it is a later release: nothing is set up', async () => {
		const chooseLocal = vi.fn(async () => {});

		const result = await choose('multi', chooseLocal, { kind: 'later' });

		expect(result).toMatchObject({
			status: 400,
			data: { message: 'Multi-user arrives in the next update.' }
		});
		expect(chooseLocal).not.toHaveBeenCalled();
	});

	it('Multi-user without its secret or origin says what to add to .env', async () => {
		const message = 'Add BETTER_AUTH_SECRET to your .env.';

		const result = await choose('multi', vi.fn(), { kind: 'needs-env', message });

		expect(result).toMatchObject({ status: 400, data: { message } });
	});

	it('choosing Multi-user where it is open goes on to the admin form without setting anything up', async () => {
		const chooseLocal = vi.fn(async () => {});
		const createFirstAdmin = vi.fn();
		const event = {
			request: { formData: async () => formOf({ mode: 'multi' }) },
			locals: { instance: { chooseLocal }, setup: setupWith({ kind: 'open' }, createFirstAdmin) }
		};

		const result = await actions.mode(event as never);

		expect(result).toEqual({
			step: 'admin',
			name: '',
			email: '',
			field: undefined,
			message: undefined
		});
		expect(chooseLocal).not.toHaveBeenCalled();
		expect(createFirstAdmin).not.toHaveBeenCalled();
	});

	it.each([[undefined], ['nonsense'], ['']])('a posted mode of %j is refused', async (mode) => {
		const chooseLocal = vi.fn(async () => {});

		const result = await run(actions.mode, mode === undefined ? {} : { mode }, {
			instance: { chooseLocal },
			setup: setupWith({ kind: 'open' })
		});

		expect(result).toMatchObject({ status: 400 });
		expect(chooseLocal).not.toHaveBeenCalled();
	});
});

describe('step 2: create the admin', () => {
	const admin = { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' };

	it('creates the admin, signs them in with the cookies it returns, and lands on the Map', async () => {
		const headers = new Headers();
		headers.append(
			'set-cookie',
			'better-auth.session_token=abc.def%3D; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax'
		);
		const createFirstAdmin = vi.fn(async () => ({ headers }));
		const cookies = { set: vi.fn() };

		const result = await run(
			actions.admin,
			admin,
			{ setup: setupWith({ kind: 'open' }, createFirstAdmin) },
			cookies
		);

		expect(createFirstAdmin).toHaveBeenCalledWith(admin);
		expect(cookies.set).toHaveBeenCalledWith(
			'better-auth.session_token',
			'abc.def=',
			expect.objectContaining({ httpOnly: true, path: '/', secure: false })
		);
		expect(result).toMatchObject({ status: 303, location: '/' });
	});

	it('does not log the cookies or the password', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
		const headers = new Headers({ 'set-cookie': 'better-auth.session_token=SECRETCOOKIE; Path=/' });

		await run(
			actions.admin,
			admin,
			{
				setup: setupWith(
					{ kind: 'open' },
					vi.fn(async () => ({ headers }))
				)
			},
			{ set: vi.fn() }
		);

		expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toMatch(
			/SECRETCOOKIE|correct horse/
		);
	});

	it('refuses where Multi-user is not open, without calling createFirstAdmin', async () => {
		const createFirstAdmin = vi.fn();

		const result = await run(actions.admin, admin, {
			setup: setupWith({ kind: 'later' }, createFirstAdmin)
		});

		expect(result).toMatchObject({
			status: 400,
			data: { message: 'Multi-user arrives in the next update.' }
		});
		expect(createFirstAdmin).not.toHaveBeenCalled();
	});

	it.each([
		['name', 'Enter a name.'],
		['email', 'Enter a valid email address.'],
		['password', 'Use 12 to 128 characters.']
	] as const)(
		'a bad %s stays on the form with a fixed message, keeping what was typed but not the password',
		async (field, message) => {
			const createFirstAdmin = vi.fn(async () => {
				throw new InvalidFirstAdminError(field, 'The input said: correct horse battery');
			});

			const result = await run(actions.admin, admin, {
				setup: setupWith({ kind: 'open' }, createFirstAdmin)
			});

			expect(result).toMatchObject({
				status: 400,
				data: { step: 'admin', field, message, name: 'Ada', email: 'ada@example.com' }
			});
			expect(JSON.stringify(result)).not.toContain('correct horse');
		}
	);

	it('an Instance someone else set up first is a fixed message, not a redirect', async () => {
		const createFirstAdmin = vi.fn(async () => {
			throw new InstanceAlreadySetUpError();
		});

		const result = await run(actions.admin, admin, {
			setup: setupWith({ kind: 'open' }, createFirstAdmin)
		});

		expect(result).toMatchObject({
			status: 409,
			data: { step: 'admin', message: 'This instance has already been set up.' }
		});
	});

	it('a Multi-user refusal from the app is a fixed message', async () => {
		const createFirstAdmin = vi.fn(async () => {
			throw new MultiUserNotAvailableError();
		});

		const result = await run(actions.admin, admin, {
			setup: setupWith({ kind: 'open' }, createFirstAdmin)
		});

		expect(result).toMatchObject({
			status: 400,
			data: { message: 'Multi-user is not available on this server.' }
		});
	});

	it('any other failure says nothing of the error: no message, path or query text reaches the form or the log', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const leaky = Object.assign(
			new Error(
				'Invalid `prisma.user.create()` invocation in /app/secret/path.ts: password hash $2b$xyz'
			),
			{ code: 'P2002' }
		);
		const createFirstAdmin = vi.fn(async () => {
			throw leaky;
		});

		const result = await run(actions.admin, admin, {
			setup: setupWith({ kind: 'open' }, createFirstAdmin)
		});

		expect(result).toMatchObject({
			status: 500,
			data: { step: 'admin', message: 'The admin account could not be created. Try again.' }
		});
		expect(JSON.stringify(result)).not.toMatch(/prisma|secret|\$2b/);
		expect(JSON.stringify(error.mock.calls)).not.toMatch(/invocation|secret|\$2b|correct horse/);
	});

	it('missing fields are a bad form, not a crash', async () => {
		const createFirstAdmin = vi.fn(async () => {
			throw new InvalidFirstAdminError('name', 'The name is required.');
		});

		const result = await run(
			actions.admin,
			{},
			{ setup: setupWith({ kind: 'open' }, createFirstAdmin) }
		);

		expect(createFirstAdmin).toHaveBeenCalledWith({ name: '', email: '', password: '' });
		expect(result).toMatchObject({ status: 400 });
	});
});

describe('load', () => {
	it('hands the page the Multi-user choice', () => {
		const multiUser: MultiUserChoice = { kind: 'later' };

		expect(load({ locals: { setup: setupWith(multiUser) } } as never)).toEqual({ multiUser });
	});
});
