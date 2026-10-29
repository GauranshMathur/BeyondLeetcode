import { isRedirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCatalogue } from '#lib/server/content/catalogue.js';
import { createAccountActions } from '#lib/server/identity/account-actions.js';
import { createMultiUserIdentity } from '#lib/server/identity/multi-user.js';
import { createRegistration } from '#lib/server/identity/registration.js';
import { createTestAuth } from '#lib/server/identity/test-auth.js';
import { createProviderStarts } from '#lib/server/identity/throttle.js';
import { createLearningCore } from '#lib/server/learning/core.js';
import { createSignUp } from './sign-up';

afterEach(() => vi.restoreAllMocks());

const SESSION_COOKIE =
	'better-auth.session_token=abc.def%3D; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax';
const ada = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct horse battery' };

type Form = Record<string, string>;
type Registration = 'open' | 'invite';

function formOf(values: Form) {
	const body = new FormData();
	for (const [key, value] of Object.entries(values)) body.set(key, value);
	return body;
}

/** The account actions over a stand-in Better Auth: the route is judged by what it makes of their answers. */
const accountsOver = (auth: unknown, registrationOpen: () => boolean) =>
	createAccountActions({
		auth: auth as never,
		providerStarts: createProviderStarts(),
		registrationOpen,
		inviteValid: async () => false
	});

/** The request event the sign-up action reads; `locals.multiUser.accounts` is built over whatever auth the test passes. */
function harness(
	options: {
		auth?: unknown;
		registration?: Registration;
		identity?: unknown;
		accounts?: unknown;
		address?: string | (() => string);
	} = {}
) {
	const signUpEmail = vi.fn(async (_input: unknown) => {
		const headers = new Headers();
		headers.append('set-cookie', SESSION_COOKIE);
		return { headers, response: {} };
	});
	const auth = 'auth' in options ? options.auth : { api: { signUpEmail } };
	const signUp = createSignUp();
	const cookies = { set: vi.fn() };
	const setHeaders = vi.fn();
	const address = options.address ?? '203.0.113.7';
	const registrationMode = () => options.registration ?? 'open';
	const accounts =
		'accounts' in options
			? options.accounts
			: auth === undefined
				? undefined
				: accountsOver(auth, () => registrationMode() === 'open');
	const locals = {
		instance: { registrationMode },
		multiUser: accounts === undefined ? undefined : { accounts },
		identity: options.identity
	};
	const event = (values: Form) => ({
		request: { formData: async () => formOf(values) },
		locals,
		cookies,
		setHeaders,
		getClientAddress: typeof address === 'function' ? address : () => address
	});
	async function post(values: Form) {
		try {
			return await signUp.action(event(values) as never);
		} catch (thrown) {
			if (isRedirect(thrown)) return thrown;
			throw thrown;
		}
	}
	return { signUp, signUpEmail, cookies, setHeaders, post, locals, event };
}

describe('the page', () => {
	it('is open while the Registration Mode is open', async () => {
		const { signUp, locals } = harness({ registration: 'open' });

		expect(await signUp.load({ locals } as never)).toEqual({ open: true, minPasswordLength: 12 });
	});

	it('shows the closed state while the Registration Mode is invite-only', async () => {
		const { signUp, locals } = harness({ registration: 'invite' });

		expect(await signUp.load({ locals } as never)).toEqual({ open: false, minPasswordLength: 12 });
	});

	it('sends someone who is already signed in to the Map', async () => {
		const { signUp, locals } = harness({ identity: { learnerId: 'l1' } });

		expect(() => signUp.load({ locals } as never)).toThrow(
			expect.objectContaining({ status: 303, location: '/' })
		);
	});
});

describe('creating an Account', () => {
	it('signs up with the typed name, email and password, forwards the session cookie and lands on the Map', async () => {
		const { post, signUpEmail, cookies } = harness();

		const result = await post({ ...ada, name: '  Ada Lovelace  ', email: ' ada@example.com ' });

		expect(signUpEmail).toHaveBeenCalledWith({ body: ada, returnHeaders: true });
		expect(cookies.set).toHaveBeenCalledWith(
			'better-auth.session_token',
			'abc.def=',
			expect.objectContaining({ httpOnly: true, path: '/', secure: false })
		);
		expect(result).toMatchObject({ status: 303, location: '/' });
	});

	it('passes nothing else on: a client cannot add a role, a Learner or any other field', async () => {
		const { post, signUpEmail } = harness();

		await post({ ...ada, role: 'admin', learnerId: 'local', mustChangePassword: 'false' });

		expect(signUpEmail).toHaveBeenCalledOnce();
		expect(signUpEmail.mock.calls[0][0]).toEqual({ body: ada, returnHeaders: true });
	});

	it('does not log the password or the cookies', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
		const { post } = harness();
		await post(ada);
		const failing = harness({
			auth: {
				api: {
					signUpEmail: async () => {
						throw new Error(`insert failed for ${ada.email} / ${ada.password} abc.def`);
					}
				}
			}
		});
		await failing.post(ada);

		expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toMatch(
			/correct horse|abc\.def|ada@example/
		);
	});

	it('redirects someone who is already signed in without creating anything', async () => {
		const { post, signUpEmail } = harness({ identity: { learnerId: 'l1' } });

		const result = await post(ada);

		expect(result).toMatchObject({ status: 303, location: '/' });
		expect(signUpEmail).not.toHaveBeenCalled();
	});
});

describe('what is wrong with the form', () => {
	it.each([
		['a blank name', { name: '   ' }, 'name', 'Enter a name.'],
		['a missing name', { name: undefined }, 'name', 'Enter a name.'],
		[
			'an email that is not one',
			{ email: 'reader@example' },
			'email',
			'Enter an email address like name@example.com.'
		],
		[
			'a missing email',
			{ email: undefined },
			'email',
			'Enter an email address like name@example.com.'
		],
		['a short password', { password: 'short' }, 'password', 'Use at least 12 characters.'],
		['a missing password', { password: undefined }, 'password', 'Use at least 12 characters.'],
		[
			'a password over 128 characters',
			{ password: 'x'.repeat(129) },
			'password',
			'Use at most 128 characters.'
		]
	])(
		'%s is refused on its field, keeping what was typed but never the password',
		async (_, change, field, message) => {
			const { post, signUpEmail } = harness();
			const values = { ...ada, ...change } as Record<string, string | undefined>;
			for (const key of Object.keys(values)) if (values[key] === undefined) delete values[key];

			const result = await post(values as Form);

			expect(result).toMatchObject({
				status: 400,
				data: { field, message, name: values.name ?? '', email: values.email ?? '' }
			});
			expect(JSON.stringify(result)).not.toContain(values.password ?? '\0');
			expect(signUpEmail).not.toHaveBeenCalled();
		}
	);

	describe('the name cap: 100 characters, counted in code points on the trimmed name', () => {
		const emoji = '\u{1F600}';
		const refusal = (values: Form) => harness().post(values);

		it('refuses a longer name on its field before calling Better Auth, keeping what was typed', async () => {
			const { post, signUpEmail } = harness();
			const name = 'x'.repeat(101);

			const result = await post({ ...ada, name });

			expect(result).toMatchObject({
				status: 400,
				data: { field: 'name', message: 'Use at most 100 characters.', name, email: ada.email }
			});
			expect(JSON.stringify(result)).not.toContain(ada.password);
			expect(signUpEmail).not.toHaveBeenCalled();
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
			const { post, signUpEmail } = harness();

			await post({ ...ada, name });

			expect(signUpEmail).toHaveBeenCalledTimes(accepted ? 1 : 0);
			if (accepted)
				expect(signUpEmail.mock.calls[0][0]).toMatchObject({ body: { name: name.trim() } });
		});

		it('answers a blank name before a long one, and a long name before a bad email or password', async () => {
			expect(await refusal({ ...ada, name: '   ' })).toMatchObject({
				data: { field: 'name', message: 'Enter a name.' }
			});
			expect(
				await refusal({ ...ada, name: 'x'.repeat(101), email: 'nope', password: 'short' })
			).toMatchObject({ data: { field: 'name', message: 'Use at most 100 characters.' } });
		});

		it('counts the refused attempt against the limit like any other', async () => {
			const throttled = harness();
			for (let i = 1; i <= 20; i++) {
				expect(
					await throttled.post({ ...ada, name: 'x'.repeat(101) }),
					`attempt ${i}`
				).toMatchObject({
					status: 400,
					data: { field: 'name' }
				});
			}

			expect(await throttled.post(ada)).toMatchObject({ status: 429 });
			expect(throttled.setHeaders).toHaveBeenCalledWith({
				'retry-after': expect.stringMatching(/^[1-9]\d*$/)
			});
		});

		it('maps Better Auth\u2019s own refusal of a blank name to the form\u2019s blank-name error', async () => {
			const raced = harness({
				auth: {
					api: {
						signUpEmail: async () => {
							throw new APIError('BAD_REQUEST', {
								message: 'Enter a name.',
								code: 'NAME_REQUIRED'
							});
						}
					}
				}
			});

			expect(await raced.post(ada)).toMatchObject({
				status: 400,
				data: { field: 'name', message: 'Enter a name.' }
			});
		});

		it('maps Better Auth\u2019s own refusal of a long name to the same field error', async () => {
			const raced = harness({
				auth: {
					api: {
						signUpEmail: async () => {
							throw new APIError('BAD_REQUEST', {
								message: 'The name is too long.',
								code: 'NAME_TOO_LONG'
							});
						}
					}
				}
			});

			expect(await raced.post(ada)).toMatchObject({
				status: 400,
				data: { field: 'name', message: 'Use at most 100 characters.' }
			});
		});
	});

	describe('control and bidi characters in the name', () => {
		const MESSAGE = "This name contains a character that can't be used.";

		it.each([0x001f, 0x007f, 0x009f, 0x202a, 0x202e, 0x2066, 0x2069])(
			'refuses U+%s on its field before calling Better Auth, keeping what was typed',
			async (cp) => {
				const { post, signUpEmail } = harness();
				const name = `Ada${String.fromCodePoint(cp)}Lovelace`;

				const result = await post({ ...ada, name });

				expect(result).toMatchObject({
					status: 400,
					data: { field: 'name', message: MESSAGE, name, email: ada.email }
				});
				expect(JSON.stringify(result)).not.toContain(ada.password);
				expect(signUpEmail).not.toHaveBeenCalled();
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
			const { post, signUpEmail } = harness();

			await post({ ...ada, name });

			expect(signUpEmail).toHaveBeenCalledTimes(accepted ? 1 : 0);
		});

		it('answers a long name before the characters', async () => {
			expect(await harness().post({ ...ada, name: `${'x'.repeat(101)}\u202e` })).toMatchObject({
				data: { message: 'Use at most 100 characters.' }
			});
		});

		it('maps Better Auth\u2019s own refusal to the same field error', async () => {
			const raced = harness({
				auth: {
					api: {
						signUpEmail: async () => {
							throw new APIError('BAD_REQUEST', {
								message: MESSAGE,
								code: 'NAME_INVALID_CHARACTERS'
							});
						}
					}
				}
			});

			expect(await raced.post(ada)).toMatchObject({
				status: 400,
				data: { field: 'name', message: MESSAGE }
			});
		});
	});

	it('accepts a password of exactly 12 and exactly 128 characters', async () => {
		for (const password of ['x'.repeat(12), 'x'.repeat(128)]) {
			const { post, signUpEmail } = harness();
			await post({ ...ada, password });
			expect(signUpEmail, String(password.length)).toHaveBeenCalledOnce();
		}
	});
});

describe('when Better Auth refuses', () => {
	const refusing = (error: unknown) =>
		harness({
			auth: {
				api: {
					signUpEmail: async () => {
						throw error;
					}
				}
			}
		});

	it('answers a closed registration with the closed message, whichever way it finds out', async () => {
		// Closed when the form is posted ...
		const closed = harness({ registration: 'invite' });
		expect(await closed.post(ada)).toMatchObject({
			status: 403,
			data: { message: 'Sign-up is closed.' }
		});
		expect(closed.signUpEmail).not.toHaveBeenCalled();
		// ... and closed in the instant between the check and the sign-up.
		const raced = refusing(new APIError('FORBIDDEN', { message: 'Sign-up is closed' }));
		expect(await raced.post(ada)).toMatchObject({
			status: 403,
			data: { message: 'Sign-up is closed.' }
		});
	});

	it('words a taken email neutrally and answers it like any other field error', async () => {
		const { post } = refusing(
			new APIError('UNPROCESSABLE_ENTITY', {
				message: 'User already exists. Use another email.',
				code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
			})
		);

		const result = await post(ada);

		expect(result).toMatchObject({
			status: 400,
			data: { field: 'email', message: 'This email cannot be used. Try a different one.' }
		});
		expect(JSON.stringify(result)).not.toMatch(/already|exists|taken|account/i);
	});

	it.each([
		['INVALID_EMAIL', 'email', 'Enter an email address like name@example.com.'],
		['PASSWORD_TOO_SHORT', 'password', 'Use at least 12 characters.'],
		['PASSWORD_TOO_LONG', 'password', 'Use at most 128 characters.']
	])('maps %s to its field with a fixed text', async (code, field, message) => {
		const { post } = refusing(
			new APIError('BAD_REQUEST', { message: `Better Auth says ${code}`, code })
		);

		const result = await post(ada);

		expect(result).toMatchObject({ status: 400, data: { field, message } });
	});

	it('hides anything else behind one fixed message and logs only the kind of failure', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = Object.assign(new Error('SQLITE_BUSY at /data/app.db: INSERT INTO "User"'), {
			code: 'SQLITE_BUSY'
		});
		const { post } = refusing(failure);

		const result = await post(ada);

		expect(result).toMatchObject({
			status: 500,
			data: { message: 'The account could not be created. Try again.' }
		});
		expect(JSON.stringify(result)).not.toMatch(/SQLITE|app\.db|INSERT/);
		expect(JSON.stringify(spy.mock.calls)).not.toMatch(/app\.db|INSERT/);
		expect(spy).toHaveBeenCalledOnce();
	});

	it('hides a Better Auth error it does not know behind the same fixed message', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { post } = refusing(
			new APIError('UNPROCESSABLE_ENTITY', {
				message: 'Failed to create user',
				code: 'FAILED_TO_CREATE_USER'
			})
		);

		const result = await post(ada);

		expect(result).toMatchObject({
			status: 500,
			data: { message: 'The account could not be created. Try again.' }
		});
	});

	it('is unavailable, not a crash, when the request has no Better Auth', async () => {
		const { post } = harness({ auth: undefined });

		expect(await post(ada)).toMatchObject({
			status: 503,
			data: { message: 'The account could not be created. Try again.' }
		});
	});
});

describe('the sign-up limit', () => {
	/** Uses up the 20 attempts the throttle allows an address. */
	const useUp = async (post: (values: Form) => Promise<unknown>) => {
		for (let i = 1; i <= 20; i++) {
			expect(await post({ ...ada, password: 'x' }), `attempt ${i}`).toMatchObject({
				status: 400,
				data: { field: 'password' }
			});
		}
	};

	it('refuses the attempt after the limit with the message and Retry-After, creating nothing', async () => {
		const { post, signUpEmail, setHeaders } = harness();
		for (let i = 1; i <= 20; i++) {
			expect(await post(ada), `attempt ${i}`).toMatchObject({ status: 303 });
		}
		signUpEmail.mockClear();

		const result = await post(ada);

		expect(result).toMatchObject({
			status: 429,
			data: { message: 'Too many attempts. Try again in a few minutes.' }
		});
		expect(signUpEmail).not.toHaveBeenCalled();
		expect(setHeaders).toHaveBeenCalledWith({ 'retry-after': expect.stringMatching(/^[1-9]\d*$/) });
	});

	it('counts every attempt: refused forms and a closed registration use up the limit too', async () => {
		const { post, signUpEmail } = harness();
		await useUp(post);

		expect(await post(ada)).toMatchObject({ status: 429 });
		expect(signUpEmail).not.toHaveBeenCalled();

		const closed = harness({ registration: 'invite' });
		for (let i = 1; i <= 20; i++) {
			expect(await closed.post(ada), `attempt ${i}`).toMatchObject({ status: 403 });
		}
		expect(await closed.post(ada)).toMatchObject({ status: 429 });
	});

	it('is kept per client address, and one address can only use up its own', async () => {
		const first = harness({ address: '203.0.113.7' });
		await useUp(first.post);

		expect(await first.post(ada)).toMatchObject({ status: 429 });
		// The same actions, another address.
		const second = first.event({ ...ada, email: 'grace@example.com' });
		second.getClientAddress = () => '203.0.113.8';
		expect(
			await first.signUp.action(second as never).catch((thrown) => {
				if (isRedirect(thrown)) return thrown;
				throw thrown;
			})
		).toMatchObject({ status: 303 });
	});

	it('still limits when the address cannot be read, in one shared bucket', async () => {
		const unreadable = () => {
			throw new Error('no address');
		};
		// Two different requests, one set of account actions: neither names an address, so both count in one bucket.
		const accounts = accountsOver(
			{
				api: {
					signUpEmail: async () => ({ headers: new Headers(), response: {} })
				}
			},
			() => true
		);
		const first = harness({ address: unreadable, accounts });
		const second = harness({ address: unreadable, accounts });
		for (let i = 1; i <= 10; i++) {
			expect(await first.post({ ...ada, password: 'x' }), `first ${i}`).toMatchObject({
				status: 400
			});
			expect(await second.post({ ...ada, password: 'x' }), `second ${i}`).toMatchObject({
				status: 400
			});
		}

		expect(await first.post(ada)).toMatchObject({ status: 429 });
		expect(await second.post(ada)).toMatchObject({ status: 429 });
	});

	it('answers a body that does not parse as the action does today: the error, after the attempt is counted', async () => {
		const { signUp, event, signUpEmail } = harness();
		const broken = {
			...event(ada),
			request: {
				formData: async () => {
					throw new TypeError('Failed to parse body');
				}
			}
		};

		await expect(signUp.action(broken as never)).rejects.toThrow('Failed to parse body');
		expect(signUpEmail).not.toHaveBeenCalled();
	});

	it('charges a body that does not parse: it and 19 parseable attempts use up the limit', async () => {
		const { signUp, event, post } = harness();
		const broken = {
			...event(ada),
			request: {
				formData: async () => {
					throw new TypeError('Failed to parse body');
				}
			}
		};
		await expect(signUp.action(broken as never)).rejects.toThrow('Failed to parse body');
		for (let i = 1; i <= 19; i++) {
			expect(await post({ ...ada, password: 'x' }), `attempt ${i}`).toMatchObject({ status: 400 });
		}

		expect(await post(ada)).toMatchObject({ status: 429 });
	});
});

describe('with Better Auth and the database', () => {
	const origin = 'http://localhost:3000';

	async function real(registration: Registration) {
		const instance = {
			mode: () => 'multi' as const,
			registrationMode: () => registration
		};
		const { db, auth } = await createTestAuth({ admit: createRegistration({ instance }) });
		const signUp = createSignUp();
		const accounts = createAccountActions({
			auth,
			providerStarts: createProviderStarts(),
			registrationOpen: () => registration === 'open',
			inviteValid: async () => false
		});
		const jar: Record<string, string> = {};
		const cookies = {
			set: (name: string, value: string) => {
				jar[name] = value;
			}
		};
		const post = async (values: Form) => {
			const event = {
				request: { formData: async () => formOf(values) },
				locals: { instance, multiUser: { accounts }, identity: undefined },
				cookies,
				setHeaders: () => {},
				getClientAddress: () => '203.0.113.7'
			};
			try {
				return await signUp.action(event as never);
			} catch (thrown) {
				if (isRedirect(thrown)) return thrown;
				throw thrown;
			}
		};
		const cookieHeader = () =>
			Object.entries(jar)
				.map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
				.join('; ');
		return { db, auth, post, cookieHeader };
	}

	it('with registration open a visitor gets an Account and a Learner of their own, signed in, with nothing done yet', async () => {
		const { db, auth, post, cookieHeader } = await real('open');

		const result = await post(ada);

		expect(result).toMatchObject({ status: 303, location: '/' });
		const user = await db.user.findUniqueOrThrow({ where: { email: ada.email } });
		expect(user).toMatchObject({ name: ada.name, role: 'learner' });
		expect(user.learnerId).toBeTruthy();
		expect(user.learnerId).not.toBe('local');
		expect(await db.learner.findUnique({ where: { id: user.learnerId as string } })).not.toBeNull();

		// The session cookie it set names that Account ...
		const who = await createMultiUserIdentity(auth).resolve({
			request: new Request(origin, { headers: { cookie: cookieHeader() } })
		} as never);
		expect(who).toMatchObject({
			learnerId: user.learnerId,
			displayName: ada.name,
			role: 'learner'
		});
		// ... and the Map for that Learner has nothing solved or complete.
		const core = createLearningCore({
			catalogue: await loadCatalogue('src/lib/server/content/fixture'),
			db
		});
		const map = await core.forLearner(user.learnerId as string).map();
		expect(map.topics.length).toBeGreaterThan(0);
		expect(map.topics.every((t) => t.coreSolved === 0 && t.state !== 'complete')).toBe(true);
	});

	it('with registration invite-only nothing is created', async () => {
		const { db, post, cookieHeader } = await real('invite');

		const result = await post(ada);

		expect(result).toMatchObject({ status: 403, data: { message: 'Sign-up is closed.' } });
		expect(await db.user.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
		expect(cookieHeader()).toBe('');
	});

	it('a second sign-up with the same email is refused neutrally and adds nothing', async () => {
		const { db, post } = await real('open');
		await post(ada);

		const result = await post({ ...ada, name: 'Someone else', email: 'ADA@example.com' });

		expect(result).toMatchObject({
			status: 400,
			data: { field: 'email', message: 'This email cannot be used. Try a different one.' }
		});
		expect(await db.user.count()).toBe(1);
		expect(await db.learner.count()).toBe(1);
	});

	it('two people get two Learners, each with their own progress', async () => {
		const { db, post } = await real('open');

		await post(ada);
		await post({ name: 'Grace', email: 'grace@example.com', password: 'another long password' });

		const users = await db.user.findMany();
		expect(users).toHaveLength(2);
		expect(new Set(users.map((u) => u.learnerId)).size).toBe(2);
		expect(await db.learner.count()).toBe(2);
	});
});
