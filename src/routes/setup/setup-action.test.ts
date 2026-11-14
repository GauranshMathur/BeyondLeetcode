import { isRedirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { MultiUserChoice } from '#lib/server/app.js';
import { newAccountRefusal, REFUSAL_CODES } from '#lib/server/identity/account-actions.js';
import {
	AccountsExistError,
	createInstance,
	InstanceAlreadySetUpError
} from '#lib/server/instance.js';
import { createTestDb } from '#lib/server/test-db.js';
import { actions, load } from './+page.server';

afterEach(() => vi.restoreAllMocks());

const notSetUp = { mode: () => null };

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
	cookies: { set: (...args: unknown[]) => void } = { set: vi.fn() },
	search = ''
) {
	const event = {
		url: new URL(`http://localhost/setup${search}`),
		request: { formData: async () => formOf(values) },
		locals: { instance: notSetUp, ...locals },
		cookies
	};
	try {
		return await action(event as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

const setupWith = (
	multiUser: MultiUserChoice,
	createFirstAdmin: Mock<(input: never) => Promise<{ headers: Headers }>> = vi.fn(async () => ({
		headers: new Headers()
	}))
) => ({ multiUser, createFirstAdmin });

/** A createFirstAdmin that makes the refusal the real one does: `newAccountRefusal`'s code, as a 400 APIError. */
const refusingAsReal = () =>
	vi.fn(async (input: { name: string; email: string; password: string }) => {
		const refusal = newAccountRefusal(input);
		if (refusal) throw new APIError('BAD_REQUEST', { message: 'x', code: refusal.refused });
		return { headers: new Headers() };
	});

const choose = (
	mode: string,
	chooseLocal: () => Promise<void>,
	multiUser: MultiUserChoice = {
		kind: 'needs-env',
		message: 'Add BETTER_AUTH_SECRET to your .env.'
	}
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

	it('redirects on an InstanceAlreadySetUpError whatever its message, and not on a plain Error that says so', async () => {
		class Reworded extends InstanceAlreadySetUpError {
			override message = 'text that no longer says it';
		}
		const redirected = await choose('local', async () => {
			throw new Reworded();
		});
		expect(redirected).toMatchObject({ status: 303, location: '/' });

		await expect(
			choose('local', async () => {
				throw new Error('The Instance is already set up; its mode cannot be chosen again.');
			})
		).rejects.toThrow('already set up');
	});

	it('choosing Local once an Account exists is refused with a fixed message, and Setup stays unset', async () => {
		const db = await createTestDb();
		await db.user.create({
			data: {
				id: 'u1',
				name: 'A',
				email: 'a@example.com',
				emailVerified: false,
				learnerId: 'local'
			}
		});
		const instance = await createInstance(db);

		const result = await choose('local', () => instance.chooseLocal());

		expect(result).toMatchObject({
			status: 409,
			data: { message: 'This instance already has accounts, so it cannot start in Local mode.' }
		});
		expect(JSON.stringify(result)).not.toContain('Prisma');
		expect(instance.mode()).toBeNull();
		expect(await db.instance.count()).toBe(0);
	});

	it('the refusal is answered the same whatever the error text says', async () => {
		const result = await choose('local', async () => Promise.reject(new AccountsExistError()));
		expect(result).toMatchObject({ status: 409 });
	});

	it('any other failure is not hidden behind a redirect', async () => {
		await expect(
			choose('local', async () => Promise.reject(new Error('disk full')))
		).rejects.toThrow('disk full');
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

	it('converts a Local Instance only on ?convert, asking createFirstAdmin for the conversion', async () => {
		const createFirstAdmin = vi.fn(async () => ({ headers: new Headers() }));
		const locals = {
			instance: { mode: () => 'local' },
			setup: setupWith({ kind: 'open' }, createFirstAdmin)
		};

		const result = await run(actions.admin, admin, locals, { set: vi.fn() }, '?/admin&convert');

		expect(createFirstAdmin).toHaveBeenCalledWith({ ...admin, convert: true });
		expect(result).toMatchObject({ status: 303, location: '/' });
	});

	it('never converts a multi Instance, ?convert or not', async () => {
		const createFirstAdmin = vi.fn();
		const locals = {
			instance: { mode: () => 'multi' },
			setup: setupWith({ kind: 'open' }, createFirstAdmin)
		};

		const result = await run(actions.admin, admin, locals, { set: vi.fn() }, '?/admin&convert');

		expect(result).toMatchObject({ status: 409 });
		expect(createFirstAdmin).not.toHaveBeenCalled();
	});

	it('a conversion the Instance refuses answers with the fixed already-set-up text', async () => {
		const createFirstAdmin = vi.fn(async () => Promise.reject(new InstanceAlreadySetUpError()));
		const locals = {
			instance: { mode: () => 'local' },
			setup: setupWith({ kind: 'open' }, createFirstAdmin)
		};

		const result = await run(actions.admin, admin, locals, { set: vi.fn() }, '?/admin&convert');

		expect(result).toMatchObject({
			status: 409,
			data: { message: 'This instance has already been set up.' }
		});
	});

	it.each(['local', 'multi'] as const)(
		'refuses an Instance that is already %s, without calling createFirstAdmin',
		async (mode) => {
			const createFirstAdmin = vi.fn();

			const result = await run(actions.admin, admin, {
				instance: { mode: () => mode },
				setup: setupWith({ kind: 'open' }, createFirstAdmin)
			});

			expect(result).toMatchObject({
				status: 409,
				data: { message: 'This instance has already been set up.' }
			});
			expect(createFirstAdmin).not.toHaveBeenCalled();
		}
	);

	describe('the name cap: 100 characters, counted in code points on the trimmed name', () => {
		const emoji = '\u{1F600}';

		it('shows a longer name\u2019s refusal on its field, keeping what was typed', async () => {
			const createFirstAdmin = refusingAsReal();
			const name = 'x'.repeat(101);

			const result = await run(
				actions.admin,
				{ ...admin, name },
				{ setup: setupWith({ kind: 'open' }, createFirstAdmin) }
			);

			expect(result).toMatchObject({
				status: 400,
				data: {
					step: 'admin',
					field: 'name',
					message: 'Use at most 100 characters.',
					name,
					email: admin.email
				}
			});
			expect(JSON.stringify(result)).not.toContain(admin.password);
		});

		it.each([
			['exactly 100 characters', 'x'.repeat(100), true],
			['101 characters', 'x'.repeat(101), false],
			['100 emoji, 200 UTF-16 units', emoji.repeat(100), true],
			['101 emoji', emoji.repeat(101), false],
			['100 characters with spaces around them', `  ${'x'.repeat(100)}   `, true],
			['101 characters with spaces around them', `  ${'x'.repeat(101)}   `, false],
			['half a megabyte', 'x'.repeat(512 * 1024), false]
		])('%s: %s', async (_label, name, accepted) => {
			const result = await run(
				actions.admin,
				{ ...admin, name },
				{ setup: setupWith({ kind: 'open' }, refusingAsReal()) }
			);

			if (accepted) expect(result).toMatchObject({ status: 303 });
			else expect(result).toMatchObject({ status: 400, data: { field: 'name' } });
		});

		it('says the Instance is already set up before it says anything about the name', async () => {
			const createFirstAdmin = refusingAsReal();

			const result = await run(
				actions.admin,
				{ ...admin, name: 'x'.repeat(101) },
				{
					setup: setupWith({ kind: 'open' }, createFirstAdmin),
					instance: { mode: () => 'local' }
				}
			);

			expect(result).toMatchObject({ status: 409 });
			expect(createFirstAdmin).not.toHaveBeenCalled();
		});
	});

	describe('control and bidi characters in the name', () => {
		const MESSAGE = "This name contains a character that can't be used.";
		it.each([0x001f, 0x007f, 0x009f, 0x202a, 0x202e, 0x2066, 0x2069])(
			'shows the refusal of U+%s on its field, keeping what was typed',
			async (cp) => {
				const name = `Ada${String.fromCodePoint(cp)}Lovelace`;

				const result = await run(
					actions.admin,
					{ ...admin, name },
					{ setup: setupWith({ kind: 'open' }, refusingAsReal()) }
				);

				expect(result).toMatchObject({
					status: 400,
					data: { step: 'admin', field: 'name', message: MESSAGE, name, email: admin.email }
				});
				expect(JSON.stringify(result)).not.toContain(admin.password);
			}
		);

		it.each([
			['a tab inside', 'Ada\tLovelace', false],
			['a newline inside', 'Ada\nLovelace', false],
			['a newline around it, trimmed', '  Ada\n', true],
			['U+0020', 'Ada Lovelace', true],
			['U+00A0', 'Ada\u00a0Lovelace', true],
			['U+202F', 'Ada\u202fLovelace', true],
			['U+206A', 'Ada\u206aLovelace', true],
			['U+2065', 'Ada\u2065Lovelace', true],
			['a ZWJ emoji sequence', '\u{1F469}\u200D\u{1F4BB}', true],
			['U+200B', 'Ada\u200bLovelace', true],
			['U+2060', 'Ada\u2060Lovelace', true]
		])('%s: accepted=%s', async (_label, name, accepted) => {
			const result = await run(
				actions.admin,
				{ ...admin, name },
				{ setup: setupWith({ kind: 'open' }, refusingAsReal()) }
			);

			expect(result).toMatchObject(accepted ? { status: 303 } : { status: 400 });
		});
	});

	it('refuses where Multi-user is not open, saying what to add to .env, without calling createFirstAdmin', async () => {
		const createFirstAdmin = vi.fn();
		const message = 'Add BETTER_AUTH_SECRET to your .env.';

		const result = await run(actions.admin, admin, {
			setup: setupWith({ kind: 'needs-env', message }, createFirstAdmin)
		});

		expect(result).toMatchObject({ status: 400, data: { message } });
		expect(createFirstAdmin).not.toHaveBeenCalled();
	});

	it('needs no test switch to offer Multi-user: choosing it goes on to the admin form wherever it is open', async () => {
		// The Setup port says open or not; nothing in the action looks at an environment switch.
		const result = await choose('multi', vi.fn(), { kind: 'open' });

		expect(result).toMatchObject({ step: 'admin' });
	});

	// The codes a form field has a Setup text for; every other code answers the generic failure.
	const WITH_TEXT = {
		NAME_REQUIRED: ['name', 'Enter a name.'],
		NAME_TOO_LONG: ['name', 'Use at most 100 characters.'],
		NAME_INVALID_CHARACTERS: ['name', "This name contains a character that can't be used."],
		INVALID_EMAIL: ['email', 'Enter a valid email address.'],
		PASSWORD_TOO_SHORT: ['password', 'Use 12 to 128 characters.'],
		PASSWORD_TOO_LONG: ['password', 'Use 12 to 128 characters.']
	} as Record<string, [string, string]>;
	// What `refusalOf` reads: the status for a 403, the body's code for the rest.
	const refusalError = (code: string) =>
		code === 'SIGN_UP_CLOSED'
			? new APIError('FORBIDDEN', { message: 'x' })
			: new APIError('BAD_REQUEST', {
					message: 'The input said: correct horse battery',
					code: code === 'EMAIL_UNAVAILABLE' ? 'USER_ALREADY_EXISTS' : code
				});

	it.each(REFUSAL_CODES)(
		'the refusal %s is a fixed message on its field, or the generic failure when Setup has no text for it',
		async (code) => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const createFirstAdmin = vi.fn(async () => Promise.reject(refusalError(code)));

			const result = await run(actions.admin, admin, {
				setup: setupWith({ kind: 'open' }, createFirstAdmin)
			});

			const text = WITH_TEXT[code];
			expect(result).toMatchObject(
				text
					? {
							status: 400,
							data: {
								step: 'admin',
								field: text[0],
								message: text[1],
								name: 'Ada',
								email: admin.email
							}
						}
					: {
							status: 500,
							data: { message: 'The admin account could not be created. Try again.' }
						}
			);
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
		expect(error).toHaveBeenCalledOnce();
		expect(String(error.mock.calls[0]?.[0])).toContain('Setup: creating the admin failed');
	});

	it('missing fields are a bad form, not a crash', async () => {
		const createFirstAdmin = refusingAsReal();

		const result = await run(
			actions.admin,
			{},
			{ setup: setupWith({ kind: 'open' }, createFirstAdmin) }
		);

		expect(createFirstAdmin).toHaveBeenCalledWith({ name: '', email: '', password: '' });
		expect(result).toMatchObject({
			status: 400,
			data: { field: 'name', message: 'Enter a name.' }
		});
	});
});

describe('load', () => {
	it('hands the page the Multi-user choice', () => {
		const multiUser: MultiUserChoice = { kind: 'open' };

		const result = load({
			locals: { instance: notSetUp, setup: setupWith(multiUser) },
			url: new URL('http://localhost/setup')
		} as never);

		expect(result).toEqual({ multiUser, converting: false });
	});

	it('is converting only on a Local Instance with ?convert', () => {
		const locals = (mode: string | null) => ({
			instance: { mode: () => mode },
			setup: setupWith({ kind: 'open' })
		});
		const converting = (mode: string | null, search: string) =>
			(
				load({
					locals: locals(mode),
					url: new URL(`http://localhost/setup${search}`)
				} as never) as {
					converting: boolean;
				}
			).converting;

		expect(converting('local', '?convert')).toBe(true);
		expect(converting('local', '')).toBe(false);
		expect(converting('multi', '?convert')).toBe(false);
		expect(converting(null, '?convert')).toBe(false);
	});
});
