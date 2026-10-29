import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inspect } from 'node:util';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { createInstance } from '../instance.ts';
import { redactingLogger } from '../logging.ts';
import { createFileTestDb, createTestDb } from '../test-db.ts';
import { resetAdminPassword, resetPassword } from './accounts.ts';
import {
	type Admission,
	CLIENT_IP_HEADER,
	createAuth,
	enabledProviders,
	hasForbiddenNameCharacter,
	isNameTooLong,
	isPlaceholderSecret,
	MAX_NAME_LENGTH,
	MIN_PASSWORD_LENGTH,
	providerName,
	socialProvidersFrom
} from './auth.ts';
import {
	createInvites,
	INVITE_COOKIE,
	INVITE_LIFETIME_MS,
	INVITE_LOG_PATTERNS
} from './invites.ts';
import { createRegistration } from './registration.ts';
import { createFirstAdmin } from './setup.ts';
import { createTestAuth, TEST_SECRET } from './test-auth.ts';

/** Everything the console got, as text: an Error counts with its message, stack and cause. */
const everythingLogged = (spies: { mock: { calls: unknown[][] } }[]) =>
	spies
		.flatMap((s) => s.mock.calls.flat())
		.map((arg) => inspect(arg, { depth: null }))
		.join('\n');

const body = { email: 'ada@example.com', password: 'correct horse battery', name: 'Ada' };

async function setup(admitSignUp: () => Admission | null | Promise<Admission | null> = () => ({})) {
	const { db, auth } = await createTestAuth({ admit: admitSignUp });
	return { db, auth };
}

describe('createAuth', () => {
	it('signs up an Account whose session carries its learnerId and role', async () => {
		const { auth, db } = await setup();

		const res = await auth.api.signUpEmail({ body, returnHeaders: true });
		const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]);
		const session = await auth.api.getSession({
			headers: new Headers({ cookie: cookie.join('; ') })
		});

		expect(session?.user.email).toBe('ada@example.com');
		expect(session?.user.role).toBe('learner');
		expect(session?.user.mustChangePassword).toBe(false);
		expect(session?.user.learnerId).toBeTruthy();
		expect(await db.learner.count({ where: { id: session?.user.learnerId ?? '' } })).toBe(1);
	});

	it('refuses sign-up by default', async () => {
		const db = await createFileTestDb();
		const auth = createAuth({ db, origin: '', secret: TEST_SECRET });

		await expect(auth.api.signUpEmail({ body })).rejects.toThrow();
		expect(await db.user.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
	});

	it('puts the admitted sign-up on the Learner and role the gate names, upserting the Learner', async () => {
		const { auth, db } = await setup(() => ({ learnerId: 'local', role: 'admin' }));
		await db.learner.create({ data: { id: 'local' } });

		await auth.api.signUpEmail({ body });

		expect(await db.user.findFirstOrThrow()).toMatchObject({ learnerId: 'local', role: 'admin' });
		expect(await db.learner.count()).toBe(1);
	});

	it('creates the named Learner when it does not exist yet', async () => {
		const { auth, db } = await setup(() => ({ learnerId: 'local' }));

		await auth.api.signUpEmail({ body });

		expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: 'local' })]);
		expect(await db.user.findFirstOrThrow()).toMatchObject({ learnerId: 'local', role: 'learner' });
	});

	it('leaves no Learner behind when the Account insert fails, and keeps the Local Learner', async () => {
		const { auth, db } = await setup();
		await db.learner.create({ data: { id: 'local' } });
		await auth.api.signUpEmail({ body });

		await expect(auth.api.signUpEmail({ body })).rejects.toThrow();

		expect(await db.user.count()).toBe(1);
		const user = await db.user.findFirstOrThrow();
		expect((await db.learner.findMany()).map((l) => l.id).sort()).toEqual(
			['local', user.learnerId].sort()
		);
	});

	it('makes one Learner for six concurrent sign-ups of one email', async () => {
		const { auth, db } = await setup();

		await Promise.allSettled(Array.from({ length: 6 }, () => auth.api.signUpEmail({ body })));

		expect(await db.user.count()).toBe(1);
		expect(await db.learner.count()).toBe(1);
	});

	it('refuses sign-up when the gate answers null, over HTTP and through auth.api', async () => {
		const { auth, db } = await setup(() => null);

		await expect(auth.api.signUpEmail({ body })).rejects.toMatchObject({ statusCode: 403 });
		const res = await auth.handler(
			new Request('http://localhost:3000/api/auth/sign-up/email', {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
				body: JSON.stringify(body)
			})
		);
		expect(res.status).toBe(403);
		expect(await db.user.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
	});

	it('refuses in the database hook on its own when the request hook admitted', async () => {
		let calls = 0;
		const { auth, db } = await setup(() => (++calls === 1 ? {} : null));

		await expect(auth.api.signUpEmail({ body })).rejects.toMatchObject({ statusCode: 403 });

		expect(calls).toBe(2);
		expect(await db.user.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
	});

	it('refuses a client that sets learnerId or role, and drops mustChangePassword', async () => {
		const { auth, db } = await setup();

		for (const [i, extra] of [{ learnerId: 'mine' }, { role: 'admin' }].entries()) {
			await expect(
				auth.api.signUpEmail({
					body: { ...body, email: `a${i}@example.com`, ...extra } as typeof body
				})
			).rejects.toMatchObject({ statusCode: 400 });
		}
		expect(await db.user.count()).toBe(0);

		// Better Auth silently ignores this one rather than refusing it.
		await auth.api.signUpEmail({
			body: { ...body, mustChangePassword: true } as typeof body
		});
		expect(await db.user.findFirstOrThrow()).toMatchObject({ mustChangePassword: false });
	});

	it('answers a closed sign-up the same for an existing email and a new one', async () => {
		const { auth, db } = await setup();
		await auth.api.signUpEmail({ body });
		const closed = createAuth({ db, origin: '', secret: TEST_SECRET });

		const status = (email: string) =>
			closed.handler(
				new Request('http://localhost:3000/api/auth/sign-up/email', {
					method: 'POST',
					headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
					body: JSON.stringify({ ...body, email })
				})
			);
		const [existing, fresh] = [await status(body.email), await status('new@example.com')];

		expect(existing.status).toBe(403);
		expect(fresh.status).toBe(403);
		expect(await existing.json()).toEqual(await fresh.json());
	});

	it('refuses a password of 11 characters and takes 12', async () => {
		const { auth } = await setup();
		await expect(
			auth.api.signUpEmail({ body: { ...body, password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) } })
		).rejects.toMatchObject({ statusCode: 400 });
		await expect(
			auth.api.signUpEmail({ body: { ...body, password: 'a'.repeat(MIN_PASSWORD_LENGTH) } })
		).resolves.toBeTruthy();
	});

	it('serves no admin endpoint over HTTP, the four the Users page uses included', async () => {
		const { auth } = await setup();
		for (const path of [
			'list-users',
			'set-user-password',
			'revoke-user-sessions',
			'remove-user',
			'set-role',
			'create-user',
			'ban-user',
			'unban-user',
			'impersonate-user',
			'stop-impersonating',
			'update-user',
			'get-user',
			'list-user-sessions',
			'revoke-user-session',
			'has-permission'
		]) {
			const res = await auth.handler(
				new Request(`http://localhost:3000/api/auth/admin/${path}`, { method: 'POST' })
			);
			expect(res.status, path).toBe(404);
		}
		for (const path of [
			'update-user',
			'verify-password',
			'update-session',
			'change-email',
			'delete-user',
			'delete-user/callback',
			'request-password-reset',
			'reset-password',
			'send-verification-email',
			'verify-email',
			'link-social',
			'unlink-account',
			'refresh-token',
			'get-access-token',
			'account-info',
			'list-accounts',
			'change-password'
		]) {
			const res = await auth.handler(
				new Request(`http://localhost:3000/api/auth/${path}`, { method: 'POST' })
			);
			expect(res.status, path).toBe(404);
		}
		for (const [method, path] of [
			['POST', 'sign-out'],
			['GET', 'get-session']
		] as const) {
			const res = await auth.handler(
				new Request(`http://localhost:3000/api/auth/${path}`, { method })
			);
			expect(res.status, path).not.toBe(404);
		}
		// GET too: a path is off whatever the method.
		for (const path of ['admin/list-users', 'admin/remove-user', 'change-password']) {
			const res = await auth.handler(
				new Request(`http://localhost:3000/api/auth/${path}`, { method: 'GET' })
			);
			expect(res.status, path).toBe(404);
		}
	});

	it('changes a password through auth.api although /change-password is off over HTTP (the form action calls it)', async () => {
		const { auth } = await setup();
		const signedUp = await auth.api.signUpEmail({ body, returnHeaders: true });
		const cookie = signedUp.headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		const newPassword = 'a brand new passphrase 42';
		const overHttp = await auth.handler(
			new Request('http://localhost:3000/api/auth/change-password', {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie },
				body: JSON.stringify({ currentPassword: body.password, newPassword })
			})
		);
		expect(overHttp.status).toBe(404);
		await expect(
			auth.api.signInEmail({ body: { email: body.email, password: newPassword } })
		).rejects.toBeTruthy();

		await auth.api.changePassword({
			headers: new Headers({ cookie }),
			body: { currentPassword: body.password, newPassword, revokeOtherSessions: true }
		});

		await expect(
			auth.api.signInEmail({ body: { email: body.email, password: newPassword } })
		).resolves.toBeTruthy();
	});

	it('serves no password sign-in over HTTP: the Sign in form, with its per-Account limits, is the one way', async () => {
		const { auth } = await setup();
		await auth.api.signUpEmail({ body });
		const signIn = (headers: Record<string, string> = {}) =>
			auth.handler(
				new Request('http://localhost:3000/api/auth/sign-in/email', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						origin: 'http://localhost:3000',
						...headers
					},
					body: JSON.stringify({ email: body.email, password: body.password })
				})
			);

		// The right password is a 404 too, and no session comes out of it.
		const res = await signIn();
		expect(res.status).toBe(404);
		expect(res.headers.getSetCookie()).toEqual([]);
		// The router refuses it before anything else, so even a form-style post cannot reach it.
		expect((await signIn({ 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(
			404
		);
		expect(
			(
				await auth.handler(
					new Request('http://localhost:3000/api/auth/sign-in/email', { method: 'GET' })
				)
			).status
		).toBe(404);

		// The server-side call the form action makes is not an HTTP path, so it is not switched off.
		const { headers, response } = await auth.api.signInEmail({
			body: { email: body.email, password: body.password },
			returnHeaders: true
		});
		expect(response.user.email).toBe(body.email);
		expect(headers.getSetCookie()[0]).toMatch(/^better-auth\.session_token=/);
	});

	it('still refuses a cross-origin POST when the environment looks like a test', async () => {
		// Better Auth 1.7.7 turns its origin and CSRF checks off when NODE_ENV is "test" or TEST is set,
		// production included, unless the config says otherwise. This run has NODE_ENV=test as well.
		vi.stubEnv('TEST', '1');
		onTestFinished(() => void vi.unstubAllEnvs());
		const { auth } = await setup();
		const signOut = (origin: string) =>
			auth.handler(
				new Request('http://localhost:3000/api/auth/sign-out', {
					method: 'POST',
					headers: { cookie: 'better-auth.session_token=x', origin }
				})
			);
		// Sign-up still takes a form post without a cookie, so it carries the cookie-less checks. This
		// setup admits everyone, so a 403 here is the origin check and not a closed sign-up.
		const signUp = (headers: Record<string, string>) =>
			auth.handler(
				new Request('http://localhost:3000/api/auth/sign-up/email', {
					method: 'POST',
					headers: { 'content-type': 'application/json', ...headers },
					body: JSON.stringify(body)
				})
			);

		expect((await signOut('https://evil.example')).status).toBe(403);
		expect((await signOut('http://localhost:3000')).status).not.toBe(403);
		// No cookie: the cross-site navigation check and a foreign Origin are refused too.
		expect(
			(await signUp({ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' })).status
		).toBe(403);
		expect((await signUp({ origin: 'https://evil.example' })).status).toBe(403);
		expect((await signUp({ origin: 'http://localhost:3000' })).status).toBe(200);
	});

	it('refuses the BETTER_AUTH_SECRET that .env.example ships, whatever its wording', async () => {
		const example = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
		const shipped = /^BETTER_AUTH_SECRET="(.*)"$/m.exec(example)?.[1];

		expect(shipped).toBeTruthy();
		expect(shipped?.length).toBeGreaterThanOrEqual(32);
		expect(isPlaceholderSecret(shipped ?? '')).toBe(true);
		expect(isPlaceholderSecret('d41d8cd98f00b204e9800998ecf8427e1a2b3c4d5e6f708192')).toBe(false);
	});

	it('needs a secret of at least 32 characters', async () => {
		const db = await createFileTestDb();
		expect(() => createAuth({ db, origin: '', secret: '' })).toThrow(/secret/i);
		expect(() => createAuth({ db, origin: '', secret: 'short' })).toThrow(/32/);
		for (const known of [
			'change-me-to-a-random-string-of-48-characters',
			'Change-Me-to-a-random-string-of-48-characters',
			'better-auth-secret-12345678901234567890'
		]) {
			expect(() => createAuth({ db, origin: '', secret: known })).toThrow(/placeholder|anyone/);
		}
	});
});

describe('the name cap', () => {
	const NAME_TOO_LONG = 'The name is too long.';
	// Better Auth's limiter keeps its counters for the whole process (20 sign-ups per address per ten
	// minutes), so each request here comes from an address of its own.
	let caller = 0;
	const signUp = (payload: Record<string, unknown>) => {
		caller += 1;
		return new Request('http://localhost:3000/api/auth/sign-up/email', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				origin: 'http://localhost:3000',
				[CLIENT_IP_HEADER]: `10.${caller >> 8}.${caller & 255}.1`
			},
			body: JSON.stringify(payload)
		});
	};
	const emoji = '\u{1F600}'; // one code point, two UTF-16 units

	describe('isNameTooLong counts Unicode code points on the trimmed name', () => {
		it('is 100', () => {
			expect(MAX_NAME_LENGTH).toBe(100);
		});

		it.each([
			['', false],
			['Ada', false],
			['a'.repeat(100), false],
			['a'.repeat(101), true],
			// Two UTF-16 units each, one code point each: 100 fit, 101 do not.
			[emoji.repeat(100), false],
			[emoji.repeat(101), true],
			[`${'a'.repeat(99)}${emoji}`, false],
			[`${'a'.repeat(100)}${emoji}`, true],
			// Lone surrogates are one code point per unit.
			['\ud800'.repeat(100), false],
			['\ud800'.repeat(101), true],
			// Trimmed first, with the same trim the forms use (Unicode whitespace included).
			[`   ${'a'.repeat(100)}   `, false],
			[`\u00a0\u3000${'a'.repeat(100)}\ufeff\n`, false],
			[`${' '.repeat(5000)}x${' '.repeat(5000)}`, false],
			[`${'a'.repeat(50)} ${'b'.repeat(50)} c`, true],
			['x'.repeat(512 * 1024), true]
		])('%j.length=%#', (name, tooLong) => {
			expect(isNameTooLong(name)).toBe(tooLong);
		});
	});

	async function http(auth: Awaited<ReturnType<typeof setup>>['auth'], name: string) {
		return auth.handler(signUp({ ...body, name }));
	}

	it('refuses a direct POST /api/auth/sign-up/email with a longer name, with a fixed error, storing nothing', async () => {
		const { auth, db } = await setup();

		const res = await http(auth, 'x'.repeat(MAX_NAME_LENGTH + 1));

		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ code: 'NAME_TOO_LONG', message: NAME_TOO_LONG });
		expect(await db.user.count()).toBe(0);
		expect(await db.account.count()).toBe(0);
		expect(await db.session.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
	});

	it('refuses the server-side call too, and any size of name, without echoing it', async () => {
		const { auth, db } = await setup();
		const huge = `${'x'.repeat(512 * 1024)}@secret-marker`;

		const refusal = await auth.api.signUpEmail({ body: { ...body, name: huge } }).then(
			() => null,
			(error: unknown) => error
		);

		expect(refusal).toMatchObject({ statusCode: 400, body: { code: 'NAME_TOO_LONG' } });
		expect(JSON.stringify((refusal as { body: unknown }).body)).not.toContain('secret-marker');
		expect(await db.user.count()).toBe(0);
	});

	it.each([
		['100 characters', 'a'.repeat(100)],
		['100 emoji', emoji.repeat(100)],
		['100 characters with spaces around them', `   ${'a'.repeat(100)}   `]
	])('accepts %s, and stores the trimmed name', async (_label, name) => {
		const { auth, db } = await setup();

		const res = await http(auth, name);

		expect(res.status).toBe(200);
		expect((await db.user.findFirstOrThrow()).name).toBe(name.trim());
	});

	it('refuses 101 emoji', async () => {
		const { auth, db } = await setup();

		const res = await http(auth, emoji.repeat(101));

		expect(res.status).toBe(400);
		expect(await db.user.count()).toBe(0);
	});

	it('cannot be got round with padding: a name that is short once trimmed is stored trimmed', async () => {
		const { auth, db } = await setup();

		const res = await http(auth, `${' '.repeat(300_000)}Ada${' '.repeat(300_000)}`);

		expect(res.status).toBe(200);
		expect((await db.user.findFirstOrThrow()).name).toBe('Ada');
	});

	it('answers a closed sign-up as closed, whatever the name: a too-long name is not told apart', async () => {
		const { auth, db } = await setup(() => null);

		const long = await http(auth, 'x'.repeat(1000));
		const short = await http(auth, 'Ada');

		expect(long.status).toBe(403);
		expect(short.status).toBe(403);
		expect(await db.user.count()).toBe(0);
	});

	it('makes no Learner for a refused name, not even the named Local one', async () => {
		const { auth, db } = await setup(() => ({ learnerId: 'local', role: 'admin' }));

		const res = await http(auth, 'x'.repeat(1000));

		expect(res.status).toBe(400);
		expect(await db.learner.count()).toBe(0);
		expect(await db.user.count()).toBe(0);
	});

	it('answers a long name the same for an email that has an Account and one that has not: no probe', async () => {
		const { auth, db } = await setup();
		await auth.api.signUpEmail({ body });
		const before = await db.user.count();
		const long = (email: string) =>
			auth.handler(signUp({ ...body, email, name: 'x'.repeat(MAX_NAME_LENGTH + 1) }));

		const known = await long(body.email);
		const unknown = await long('nobody@example.com');

		expect(known.status).toBe(400);
		expect(unknown.status).toBe(400);
		expect(await known.json()).toEqual(await unknown.json());
		expect(await db.user.count()).toBe(before);
	});

	it('still answers a closed sign-up first: 403 for a long name, a blank one, a known email or not', async () => {
		const { auth, db } = await setup(() => null);
		const post = (email: string, name: string) => auth.handler(signUp({ ...body, email, name }));

		for (const name of ['x'.repeat(1000), '   ', '']) {
			expect((await post(body.email, name)).status, JSON.stringify(name.slice(0, 5))).toBe(403);
		}
		expect(await db.user.count()).toBe(0);
	});

	describe('a blank name', () => {
		it.each([
			['empty', ''],
			['spaces', '   '],
			['Unicode whitespace', '\u00a0\u3000\ufeff\n\t']
		])('is refused over HTTP, %s, with a fixed error, storing nothing', async (_label, name) => {
			const { auth, db } = await setup();

			const res = await auth.handler(signUp({ ...body, name }));

			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ code: 'NAME_REQUIRED', message: 'Enter a name.' });
			expect(await db.user.count()).toBe(0);
			expect(await db.learner.count()).toBe(0);
		});

		it('is refused by the server-side call too, storing nothing', async () => {
			const { auth, db } = await setup();

			await expect(auth.api.signUpEmail({ body: { ...body, name: '  ' } })).rejects.toMatchObject({
				statusCode: 400,
				body: { code: 'NAME_REQUIRED' }
			});
			expect(await db.user.count()).toBe(0);
		});

		it('is refused for a known email the same as for an unknown one: no probe', async () => {
			const { auth } = await setup();
			await auth.api.signUpEmail({ body });
			const blank = (email: string) => auth.handler(signUp({ ...body, email, name: ' ' }));

			const known = await blank(body.email);
			const unknown = await blank('nobody@example.com');

			expect(known.status).toBe(400);
			expect(await known.json()).toEqual(await unknown.json());
		});
	});

	it('refuses the first admin with a longer name, and leaves the Instance not set up', async () => {
		const { db, auth } = await createTestAuth({
			// The registration gate needs the Instance, which needs the database: admit through a late binding.
			admit: (attempt) => gate(attempt)
		});
		const instance = await createInstance(db);
		const gate = createRegistration({ instance });

		await expect(
			createFirstAdmin({ instance, auth, db }, { ...body, name: 'x'.repeat(101) })
		).rejects.toMatchObject({ body: { code: 'NAME_TOO_LONG' } });

		expect(instance.mode()).toBeNull();
		expect(await db.user.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
	});
});

describe('control and bidi characters in a name', () => {
	const MESSAGE = "This name contains a character that can't be used.";
	let caller = 0;
	const signUp = (payload: Record<string, unknown>) => {
		caller += 1;
		return new Request('http://localhost:3000/api/auth/sign-up/email', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				origin: 'http://localhost:3000',
				[CLIENT_IP_HEADER]: `10.${100 + (caller >> 8)}.${caller & 255}.1`
			},
			body: JSON.stringify(payload)
		});
	};
	const at = (cp: number) => `Ada${String.fromCodePoint(cp)}Lovelace`;

	it.each([
		[0x0000, true],
		[0x001f, true],
		[0x0020, false],
		[0x007e, false],
		[0x007f, true],
		[0x009f, true],
		[0x00a0, false],
		[0x2029, false],
		[0x202a, true],
		[0x202e, true],
		[0x202f, false],
		[0x2065, false],
		[0x2066, true],
		[0x2069, true],
		[0x206a, false],
		// Allowed by decision: ZWJ for emoji sequences, and the zero-width space and word joiner.
		[0x200b, false],
		[0x200d, false],
		[0x2060, false]
	])('U+%s refused=%s', (cp, refused) => {
		expect(hasForbiddenNameCharacter(at(cp))).toBe(refused);
	});

	it('refuses a tab or newline inside the name but not around it (trimmed away)', () => {
		expect(hasForbiddenNameCharacter('Ada\tLovelace')).toBe(true);
		expect(hasForbiddenNameCharacter('Ada\nLovelace')).toBe(true);
		expect(hasForbiddenNameCharacter('  Ada Lovelace\n')).toBe(false);
	});

	it('allows an emoji ZWJ sequence', () => {
		expect(hasForbiddenNameCharacter('\u{1F469}\u200D\u{1F4BB} Ada')).toBe(false);
	});

	it.each([[0x001f], [0x007f], [0x009f], [0x202a], [0x202e], [0x2066], [0x2069]])(
		'refuses U+%s over HTTP with a fixed error, storing nothing',
		async (cp) => {
			const { auth, db } = await setup();

			const res = await auth.handler(signUp({ ...body, name: at(cp) }));

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json).toMatchObject({ code: 'NAME_INVALID_CHARACTERS', message: MESSAGE });
			expect(JSON.stringify(json)).not.toContain('Ada');
			expect(await db.user.count()).toBe(0);
			expect(await db.account.count()).toBe(0);
			expect(await db.session.count()).toBe(0);
			expect(await db.learner.count()).toBe(0);
		}
	);

	it('refuses the server-side call too, storing nothing', async () => {
		const { auth, db } = await setup();

		await expect(
			auth.api.signUpEmail({ body: { ...body, name: at(0x202e) } })
		).rejects.toMatchObject({
			statusCode: 400,
			body: { code: 'NAME_INVALID_CHARACTERS' }
		});
		expect(await db.user.count()).toBe(0);
	});

	it('checks the name as it would be stored: a control character around it is trimmed, not refused', async () => {
		const { auth, db } = await setup();

		const res = await auth.handler(signUp({ ...body, name: '\n Ada \t' }));

		expect(res.status).toBe(200);
		expect((await db.user.findFirstOrThrow()).name).toBe('Ada');
	});

	it.each([
		['a ZWJ sequence', '\u{1F469}\u200D\u{1F4BB}'],
		['a zero-width space', 'Ada\u200BLovelace'],
		['a word joiner', 'Ada\u2060Lovelace']
	])('accepts %s over HTTP and stores it', async (_label, name) => {
		const { auth, db } = await setup();

		const res = await auth.handler(signUp({ ...body, name }));

		expect(res.status).toBe(200);
		expect((await db.user.findFirstOrThrow()).name).toBe(name);
	});

	it('answers the same for an email that has an Account and one that has not: no probe', async () => {
		const { auth, db } = await setup();
		await auth.api.signUpEmail({ body });
		const before = await db.user.count();
		const bad = (email: string) => auth.handler(signUp({ ...body, email, name: at(0x202e) }));

		const known = await bad(body.email);
		const unknown = await bad('nobody@example.com');

		expect(known.status).toBe(400);
		expect(unknown.status).toBe(400);
		expect(await known.json()).toEqual(await unknown.json());
		expect(await db.user.count()).toBe(before);
	});

	it('still answers a closed sign-up with 403 first, whatever the name', async () => {
		const { auth, db } = await setup(() => null);

		expect((await auth.handler(signUp({ ...body, name: at(0x202e) }))).status).toBe(403);
		expect(await db.user.count()).toBe(0);
	});

	it('answers a too-long name before the characters', async () => {
		const { auth } = await setup();

		const long = await auth.handler(signUp({ ...body, name: `${'x'.repeat(101)}\u202e` }));

		expect(await long.json()).toMatchObject({ code: 'NAME_TOO_LONG' });
	});

	it('refuses the first admin and leaves the Instance not set up', async () => {
		const { db, auth } = await createTestAuth({
			// The registration gate needs the Instance, which needs the database: admit through a late binding.
			admit: (attempt) => gate(attempt)
		});
		const instance = await createInstance(db);
		const gate = createRegistration({ instance });

		await expect(
			createFirstAdmin({ instance, auth, db }, { ...body, name: at(0x202e) })
		).rejects.toMatchObject({ body: { code: 'NAME_INVALID_CHARACTERS' } });

		expect(instance.mode()).toBeNull();
		expect(await db.user.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
	});
});

describe('accepting an Invite', () => {
	const origin = 'http://localhost:3000';
	const adminWho = { learnerId: 'local', displayName: 'Ada', role: 'admin' as const };
	let caller = 0;

	async function invited(options: { claim?: 'real' | 'lose' | 'throw'; now?: () => Date } = {}) {
		// The gate and the claim need the invites, which need the database the harness creates: bound late.
		let invites: ReturnType<typeof createInvites>;
		let gate: ReturnType<typeof createRegistration>;
		const instance = {
			mode: () => 'multi' as const,
			registrationMode: () => 'invite' as 'invite' | 'open'
		};
		const now = options.now ?? (() => new Date());
		const { db, auth } = await createTestAuth({
			admit: (attempt) => gate(attempt),
			claimInvite:
				options.claim === 'lose'
					? async () => false
					: options.claim === 'throw'
						? async () => {
								throw new Error('database is locked');
							}
						: (t, at) => invites.claim(t, at)
		});
		invites = createInvites({ db, origin });
		gate = createRegistration({ instance, invites, now });
		await db.learner.create({ data: { id: 'local' } });
		await db.user.create({
			data: {
				id: 'u-admin',
				name: 'Ada',
				email: 'admin@example.com',
				role: 'admin',
				learnerId: 'local'
			}
		});
		const post = (
			token: string | null,
			payload: object = { ...body, email: `n${caller}@example.com` }
		) =>
			auth.handler(
				new Request(`${origin}/api/auth/sign-up/email`, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						origin,
						[CLIENT_IP_HEADER]: `10.2.${caller >> 8}.${caller++ & 255}`,
						...(token ? { cookie: `${INVITE_COOKIE}=${token}` } : {})
					},
					body: JSON.stringify(payload)
				})
			);
		/** Like `post`, for a step made to fail with a non-API error: that error leaves the handler (500 here). */
		const postSafe = (...args: Parameters<typeof post>) =>
			post(...args).catch(() => new Response(null, { status: 500 }));
		const made = () => invites.create({ who: adminWho, now: new Date() });
		return { db, invites, instance, post, postSafe, made };
	}

	it('creates exactly one learner Account, and a second use is refused', async () => {
		const { db, post, made } = await invited();
		const { token, id } = await made();

		const first = await post(token);
		const second = await post(token);

		expect(first.status).toBe(200);
		expect(second.status).toBe(403);
		const users = await db.user.findMany({ where: { id: { not: 'u-admin' } } });
		expect(users).toHaveLength(1);
		expect(users[0].role).toBe('learner');
		expect(users[0].learnerId).not.toBe('local');
		expect(await db.learner.count()).toBe(2);
		expect((await db.invite.findUniqueOrThrow({ where: { id } })).usedAt).not.toBeNull();
	});

	it('refuses no cookie, an unknown token, an expired link and a cancelled one', async () => {
		const later = new Date(Date.now() + INVITE_LIFETIME_MS + 1000);
		const { db, post, made, invites } = await invited({ now: () => later });
		const expired = await made();
		const fresh = await invited();
		const cancelled = await fresh.made();
		await fresh.invites.cancel({ who: adminWho, id: cancelled.id });

		expect((await post(null)).status).toBe(403);
		expect((await post('A'.repeat(43))).status).toBe(403);
		expect((await post(expired.token)).status).toBe(403);
		expect((await fresh.post(cancelled.token)).status).toBe(403);
		expect(await db.user.count()).toBe(1);
		expect(await fresh.db.user.count()).toBe(1);
		expect(invites).toBeDefined();
	});

	it('lets one of two sign-ups racing on one token win', async () => {
		const { db, post, made } = await invited();
		const { token } = await made();

		const answers = await Promise.all([post(token), post(token), post(token)]);

		expect(answers.filter((r) => r.status === 200)).toHaveLength(1);
		expect(await db.user.count()).toBe(2);
		expect(await db.learner.count()).toBe(2);
		expect(await db.account.count()).toBe(1);
	});

	it('removes the Account and leaves no Learner when the claim is lost after the gate said yes', async () => {
		const { db, post, made } = await invited({ claim: 'lose' });
		const { token } = await made();

		const res = await post(token);

		expect(res.status).toBe(403);
		expect(res.headers.getSetCookie()).toEqual([]);
		expect(await db.user.count()).toBe(1);
		expect(await db.learner.count()).toBe(1);
		expect(await db.account.count()).toBe(0);
		expect(await db.session.count()).toBe(0);
	});

	it.each([
		[
			'expired',
			async (h: Awaited<ReturnType<typeof invited>>, id: string) => {
				await h.db.invite.update({
					where: { id },
					data: { expiresAt: new Date(Date.now() - 1000) }
				});
			}
		],
		[
			'cancelled',
			async (h: Awaited<ReturnType<typeof invited>>, id: string) => {
				await h.invites.cancel({ who: adminWho, id });
			}
		]
	])(
		'a %s link sets no cookie and writes no User, Account, Session or Learner',
		async (_name, spoil) => {
			const h = await invited();
			const { token, id } = await h.made();
			await spoil(h, id);

			const res = await h.post(token);

			expect(res.status).toBe(403);
			expect(res.headers.getSetCookie()).toEqual([]);
			expect(await h.db.user.count()).toBe(1);
			expect(await h.db.account.count()).toBe(0);
			expect(await h.db.session.count()).toBe(0);
			expect(await h.db.learner.count()).toBe(1);
		}
	);

	it.each([
		['Account', 0],
		['Session', 1]
	])(
		'leaves the Invite spent, no cookie and at most the one Account it paid for when the %s cannot be written',
		async (table, accounts) => {
			const { db, postSafe: post, made } = await invited();
			const { token, id } = await made();
			await db.$executeRawUnsafe(
				`CREATE TRIGGER fail_${table} BEFORE INSERT ON "${table}" BEGIN SELECT RAISE(ABORT, 'disk I/O error'); END`
			);
			const email = 'half@example.com';

			const res = await post(token, { ...body, email });

			expect(res.status).toBeGreaterThanOrEqual(400);
			expect(res.headers.getSetCookie()).toEqual([]);
			expect((await db.invite.findUniqueOrThrow({ where: { id } })).usedAt).not.toBeNull();
			expect(await db.session.count()).toBe(0);
			// Better Auth does not roll its steps back here: a failed Account leaves a User no one can sign in
			// as; a failed Session leaves the one Account (the invitee signs in with the password they chose).
			expect(await db.account.count()).toBe(accounts);
			// The link is spent, so no second Account can come of it.
			await db.$executeRawUnsafe(`DROP TRIGGER fail_${table}`);
			expect((await post(token, { ...body, email: 'second@example.com' })).status).toBe(403);
			expect(await db.account.count()).toBe(accounts);
		}
	);

	it('removing a User removes its Account and Session', async () => {
		const { db, post, made } = await invited();
		const { token } = await made();
		expect((await post(token)).status).toBe(200);
		expect(await db.account.count()).toBe(1);
		expect(await db.session.count()).toBe(1);

		await db.user.deleteMany({ where: { email: { not: 'admin@example.com' } } });

		expect(await db.account.count()).toBe(0);
		expect(await db.session.count()).toBe(0);
	});

	it("keeps the invite path out of Better Auth's own log", async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
		const { post, made } = await invited();
		const { token } = await made();

		const res = await post(token, {
			...body,
			email: 'cb@example.com',
			callbackURL: `https://evil.example/invite/${token}`
		});

		expect(res.status).toBe(403);
		const logged = everythingLogged(spies);
		expect(logged).toContain('Invalid callbackURL');
		expect(logged).not.toContain(token);
	});

	it('lets a non-API error out of the handler without printing it, and still answers refusals with their status and code', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
		const { db, post, made } = await invited();
		const { token } = await made();
		vi.spyOn(db.learner, 'upsert').mockRejectedValue(
			new Error(`locked: GET /invite/${token} beyondleetcode_invite=${token}`) as never
		);

		await expect(post(token, { ...body, email: 'boom@example.com' })).rejects.toThrow('locked');
		expect(everythingLogged(spies)).not.toContain(token);
		vi.restoreAllMocks();

		// Refusals are still answered, with the status and code they had.
		const closed = await post(null, { ...body, email: 'closed@example.com' });
		expect(closed.status).toBe(403);
		const tooLong = await post((await made()).token, {
			...body,
			email: 'long@example.com',
			name: 'x'.repeat(101)
		});
		expect(tooLong.status).toBe(400);
		expect((await tooLong.json()).code).toBe('NAME_TOO_LONG');
		const duplicate = await post((await made()).token, { ...body, email: 'admin@example.com' });
		expect(duplicate.status).toBe(422);
	});

	it('logs a fixed line, not the error, when removing the Account after a failed Learner fails too', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { db, post, made } = await invited();
		const { token } = await made();
		vi.spyOn(db.learner, 'upsert').mockRejectedValue(new Error('locked /invite/secret') as never);
		vi.spyOn(db.user, 'deleteMany').mockRejectedValue(new Error('locked /invite/secret') as never);

		await post(token).catch(() => {});

		const logged = everythingLogged([spy]);
		expect(logged).toContain('removing an Account after its Learner failed also failed');
		expect(logged).not.toContain('/invite/secret');
	});

	it('does not spend the Invite when the name is refused, so the invitee can try again', async () => {
		const { db, post, made } = await invited();
		const { token, id } = await made();

		const bad = await post(token, { ...body, name: 'x'.repeat(101) });
		expect(bad.status).toBe(400);
		expect((await bad.json()).code).toBe('NAME_TOO_LONG');
		expect((await db.invite.findUniqueOrThrow({ where: { id } })).usedAt).toBeNull();

		expect((await post(token)).status).toBe(200);
	});

	it('spends the Invite when registration is open too', async () => {
		const { db, post, made, instance } = await invited();
		const { token, id } = await made();
		instance.registrationMode = () => 'open';

		expect((await post(token)).status).toBe(200);
		expect((await db.invite.findUniqueOrThrow({ where: { id } })).usedAt).not.toBeNull();
	});

	it('removes the Account and keeps the Invite when the claim throws, and the invitee can retry', async () => {
		const { db, post, made } = await invited({ claim: 'throw' });
		const { token, id } = await made();

		const res = await post(token);

		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(await db.user.count()).toBe(1);
		expect(await db.account.count()).toBe(0);
		expect(await db.session.count()).toBe(0);
		expect(await db.learner.count()).toBe(1);
		expect((await db.invite.findUniqueOrThrow({ where: { id } })).usedAt).toBeNull();
	});

	it('removes the Account, leaves the Invite spent and sets no cookie when the Learner cannot be made', async () => {
		const { db, postSafe: post, made } = await invited();
		const { token, id } = await made();
		const upsert = db.learner.upsert.bind(db.learner);
		let calls = 0;
		vi.spyOn(db.learner, 'upsert').mockImplementation(((args: never) => {
			if (++calls === 1) throw new Error('database is locked');
			return upsert(args);
		}) as never);

		const res = await post(token);

		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(await db.user.count()).toBe(1);
		expect(await db.account.count()).toBe(0);
		expect(await db.session.count()).toBe(0);
		expect(await db.learner.count()).toBe(1);
		// Spent before anything was written: the admin reissues.
		expect((await db.invite.findUniqueOrThrow({ where: { id } })).usedAt).not.toBeNull();
		expect((await post(token)).status).toBe(403);
	});

	it('removes the Account of any sign-up whose Learner cannot be made, with no Invite involved', async () => {
		const { auth, db } = await setup(() => ({}));
		vi.spyOn(db.learner, 'upsert').mockRejectedValue(new Error('database is locked') as never);

		await auth
			.handler(
				new Request('http://localhost:3000/api/auth/sign-up/email', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						origin: 'http://localhost:3000',
						[CLIENT_IP_HEADER]: '10.9.9.9'
					},
					body: JSON.stringify(body)
				})
			)
			.catch(() => {});

		expect(await db.user.count()).toBe(0);
		expect(await db.account.count()).toBe(0);
	});
});

describe('signing in with a provider', () => {
	const origin = 'http://localhost:3000';
	const adminWho = { learnerId: 'local', displayName: 'Ada', role: 'admin' as const };
	const SECRETS = { github: { clientId: 'gh-id', clientSecret: 'gh-secret' } };
	let caller = 0;

	type Profile = { id?: number; login?: string; name?: string | null; email?: string };

	/** A GitHub that answers from memory: the token exchange, the profile and the email list. */
	function githubAnswers(profile: Profile) {
		const full = {
			id: 4242,
			login: 'octo',
			name: 'Octo Cat',
			email: 'octo@example.com',
			...profile
		};
		return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input instanceof Request ? input.url : input);
			if (url === 'https://github.com/login/oauth/access_token') {
				return Response.json({
					access_token: 'gh-token',
					id_token: 'PLAIN-ID-TOKEN',
					token_type: 'bearer',
					scope: 'read:user'
				});
			}
			if (url === 'https://api.github.com/user') return Response.json(full);
			if (url === 'https://api.github.com/user/emails') {
				return Response.json([{ email: full.email, primary: true, verified: true }]);
			}
			throw new Error('unexpected request');
		});
	}

	async function harness(
		options: {
			mode?: 'invite' | 'open';
			claim?: 'real' | 'lose';
			providers?: Parameters<typeof createAuth>[0]['socialProviders'];
		} = {}
	) {
		// The gate and the claim need the invites, which need the database the harness creates: bound late.
		let invites: ReturnType<typeof createInvites>;
		let gate: ReturnType<typeof createRegistration>;
		let mode: 'invite' | 'open' = options.mode ?? 'invite';
		const instance = { mode: () => 'multi' as const, registrationMode: () => mode };
		const { db, auth } = await createTestAuth({
			admit: (attempt) => gate(attempt),
			claimInvite: options.claim === 'lose' ? async () => false : (t, at) => invites.claim(t, at),
			socialProviders: options.providers ?? SECRETS
		});
		invites = createInvites({ db, origin });
		gate = createRegistration({ instance, invites });
		await db.learner.create({ data: { id: 'local' } });
		await db.user.create({
			data: {
				id: 'u-admin',
				name: 'Ada',
				email: 'admin@example.com',
				role: 'admin',
				learnerId: 'local'
			}
		});
		onTestFinished(() => {
			vi.restoreAllMocks();
		});
		const made = () => invites.create({ who: adminWho, now: new Date() });

		/** The whole round trip: the button, the provider's redirect back (with the invite cookie, if any). */
		async function signIn(inviteToken?: string, callbackURL = '/', errorCallbackURL = '/signin') {
			const start = await auth.api.signInSocial({
				body: { provider: 'github', callbackURL, errorCallbackURL },
				returnHeaders: true
			});
			const state = new URL(start.response.url as string).searchParams.get('state');
			const cookies = start.headers.getSetCookie().map((c) => c.split(';')[0]);
			if (inviteToken) cookies.push(`${INVITE_COOKIE}=${inviteToken}`);
			return auth.handler(
				new Request(`${origin}/api/auth/callback/github?code=the-code&state=${state}`, {
					headers: { cookie: cookies.join('; '), [CLIENT_IP_HEADER]: `10.3.0.${caller++ & 255}` }
				})
			);
		}
		const written = async () => ({
			users: await db.user.count({ where: { id: { not: 'u-admin' } } }),
			learners: await db.learner.count({ where: { id: { not: 'local' } } }),
			accounts: await db.account.count(),
			sessions: await db.session.count()
		});
		const setMode = (next: 'invite' | 'open') => {
			mode = next;
		};
		return { db, auth, invites, signIn, made, written, setMode };
	}
	const errorOf = (res: Response) =>
		new URL(res.headers.get('location') ?? '', origin).searchParams.get('error');
	const NOTHING = { users: 0, learners: 0, accounts: 0, sessions: 0 };

	it('offers a provider only when both its variables are set', () => {
		expect(socialProvidersFrom({})).toEqual({});
		expect(socialProvidersFrom({ GITHUB_CLIENT_ID: 'a' })).toEqual({});
		expect(socialProvidersFrom({ GITHUB_CLIENT_SECRET: 'b' })).toEqual({});
		expect(socialProvidersFrom({ GITHUB_CLIENT_ID: 'a', GITHUB_CLIENT_SECRET: '  ' })).toEqual({});
		expect(
			socialProvidersFrom({
				GITHUB_CLIENT_ID: 'a',
				GITHUB_CLIENT_SECRET: 'b',
				GOOGLE_CLIENT_ID: 'c',
				GOOGLE_CLIENT_SECRET: 'd'
			})
		).toEqual({
			github: { clientId: 'a', clientSecret: 'b' },
			google: { clientId: 'c', clientSecret: 'd' }
		});
	});

	it('has the providers it was given, and none by default', async () => {
		expect(enabledProviders((await createTestAuth()).auth)).toEqual([]);
		expect(enabledProviders((await createTestAuth({ socialProviders: SECRETS })).auth)).toEqual([
			'github'
		]);
		const { auth: both } = await createTestAuth({
			socialProviders: { ...SECRETS, google: { clientId: 'g', clientSecret: 's' } }
		});
		expect(enabledProviders(both)).toEqual(['github', 'google']);
	});

	it('refuses a provider that is not configured', async () => {
		const h = await harness({ providers: {} });
		await expect(
			h.auth.api.signInSocial({ body: { provider: 'github', callbackURL: '/' } })
		).rejects.toBeTruthy();
	});

	it('serves no sign-in start over HTTP: the Sign in page is the one way', async () => {
		const h = await harness();
		const res = await h.auth.handler(
			new Request(`${origin}/api/auth/sign-in/social`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin },
				body: JSON.stringify({ provider: 'github', callbackURL: '/' })
			})
		);
		expect(res.status).toBe(404);
	});

	it('Open mode with no invite: makes a learner Account with a Learner and a session', async () => {
		githubAnswers({});
		const h = await harness({ mode: 'open' });

		const res = await h.signIn();

		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/');
		const user = await h.db.user.findUniqueOrThrow({ where: { email: 'octo@example.com' } });
		expect(user).toMatchObject({ name: 'Octo Cat', role: 'learner' });
		expect(await h.db.learner.count({ where: { id: user.learnerId } })).toBe(1);
		expect(await h.db.account.count({ where: { userId: user.id, providerId: 'github' } })).toBe(1);
		const cookie = res.headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		const session = await h.auth.api.getSession({ headers: new Headers({ cookie }) });
		expect(session?.user.learnerId).toBe(user.learnerId);
	});

	it('Invite-only with no invite: refused, back to Sign in, nothing written', async () => {
		githubAnswers({});
		const h = await harness();

		const res = await h.signIn();

		expect(res.status).toBe(302);
		expect(new URL(res.headers.get('location') ?? '', origin).pathname).toBe('/signin');
		expect(errorOf(res)).toBe('SIGN_UP_CLOSED');
		expect(res.headers.getSetCookie().some((c) => c.startsWith('better-auth.session_token'))).toBe(
			false
		);
		expect(await h.written()).toEqual(NOTHING);
	});

	it('Invite-only with an unknown, spent or cancelled invite: refused, nothing written', async () => {
		githubAnswers({});
		const h = await harness();
		const spent = await h.made();
		const cancelled = await h.made();
		await h.invites.cancel({ who: adminWho, id: cancelled.id });
		await h.db.invite.update({ where: { id: spent.id }, data: { usedAt: new Date() } });

		for (const token of ['A'.repeat(43), spent.token, cancelled.token]) {
			const res = await h.signIn(token);
			expect(errorOf(res)).toBe('SIGN_UP_CLOSED');
		}
		expect(await h.written()).toEqual(NOTHING);
	});

	it('Invite-only with a valid invite cookie: makes the Account and spends the invite once', async () => {
		githubAnswers({});
		const h = await harness();
		const { token, id } = await h.made();

		const res = await h.signIn(token);

		expect(res.headers.get('location')).toBe('/');
		expect(await h.db.user.count({ where: { email: 'octo@example.com' } })).toBe(1);
		expect((await h.db.invite.findUniqueOrThrow({ where: { id } })).usedAt).not.toBeNull();
		// Another identity cannot use it again.
		githubAnswers({ id: 7, login: 'other', email: 'other@example.com' });
		const again = await h.signIn(token);
		expect(errorOf(again)).toBe('SIGN_UP_CLOSED');
		expect(await h.db.user.count({ where: { email: 'other@example.com' } })).toBe(0);
	});

	it('Open mode claims a valid invite cookie too', async () => {
		githubAnswers({});
		const h = await harness({ mode: 'open' });
		const { token, id } = await h.made();

		await h.signIn(token);

		expect((await h.db.invite.findUniqueOrThrow({ where: { id } })).usedAt).not.toBeNull();
	});

	it('a lost claim refuses and writes nothing, in either mode', async () => {
		githubAnswers({});
		for (const mode of ['invite', 'open'] as const) {
			const h = await harness({ mode, claim: 'lose' });
			const { token } = await h.made();

			const res = await h.signIn(token);

			expect(errorOf(res)).toBe('SIGN_UP_CLOSED');
			expect(await h.written()).toEqual(NOTHING);
		}
	});

	it('a signed-up identity signs in again without a new Account and keeps its name', async () => {
		githubAnswers({});
		const h = await harness({ mode: 'open' });
		await h.signIn();
		await h.db.user.update({ where: { email: 'octo@example.com' }, data: { name: 'Renamed' } });
		githubAnswers({ name: 'Changed On GitHub' });

		const res = await h.signIn();

		expect(res.headers.get('location')).toBe('/');
		expect(await h.db.user.count({ where: { id: { not: 'u-admin' } } })).toBe(1);
		expect(await h.db.account.count()).toBe(1);
		expect((await h.db.user.findUniqueOrThrow({ where: { email: 'octo@example.com' } })).name).toBe(
			'Renamed'
		);
	});

	it('never links to an existing Account with the same email', async () => {
		githubAnswers({ email: 'admin@example.com' });
		const h = await harness({ mode: 'open' });

		const res = await h.signIn();

		expect(new URL(res.headers.get('location') ?? '', origin).pathname).toBe('/signin');
		expect(new URL(res.headers.get('location') ?? '', origin).searchParams.get('error')).not.toBe(
			null
		);
		expect(await h.db.account.count()).toBe(0);
		expect(await h.db.session.count()).toBe(0);
		expect(await h.db.user.count()).toBe(1);
	});

	describe('the name of an Account made through a provider', () => {
		async function nameFor(profile: Profile) {
			githubAnswers(profile);
			const h = await harness({ mode: 'open' });
			const res = await h.signIn();
			expect(res.headers.get('location')).toBe('/');
			return (await h.db.user.findFirstOrThrow({ where: { id: { not: 'u-admin' } } })).name;
		}

		it('is cut to 100 characters', async () => {
			expect([...(await nameFor({ name: 'x'.repeat(300) }))]).toHaveLength(MAX_NAME_LENGTH);
		});

		it('counts an emoji as one character', async () => {
			expect([...(await nameFor({ name: '😀'.repeat(150) }))]).toHaveLength(MAX_NAME_LENGTH);
		});

		it('falls back to the login, then the email before the @, when there is no name', async () => {
			expect(await nameFor({ name: null, login: 'octo-login' })).toBe('octo-login');
			expect(await nameFor({ name: '   ', login: '', email: 'pat.q@example.com' })).toBe('pat.q');
		});

		it('loses control and bidi characters', async () => {
			const name = await nameFor({ name: 'Ev‮il\u0000 Name' });
			expect(name).toBe('Evil Name');
			expect(hasForbiddenNameCharacter(name)).toBe(false);
		});
	});

	it('providerName gives nothing only when every source is empty', () => {
		expect(providerName(undefined, undefined, undefined)).toBe('');
		expect(providerName(7, null, '@example.com')).toBe('');
		expect(providerName('  Ada  ', 'x', 'y@z')).toBe('Ada');
	});

	it('logs a failed token exchange or Account creation as the error kind only, never its message', async () => {
		const h = await harness({ mode: 'open' });
		githubAnswers({});
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		// The token exchange answers with an error carrying a path and a secret-looking value.
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
			throw Object.assign(new Error('/home/secret/path?code=SECRET-CODE'), { code: 'ECONNRESET' });
		});

		const res = await h.signIn();

		expect(res.status).toBe(302);
		expect(everythingLogged([log, warn])).toContain('Error ECONNRESET');
		expect(everythingLogged([log, warn])).not.toContain('SECRET-CODE');
		expect(everythingLogged([log, warn])).not.toContain('/home/secret/path');
	});

	describe('what a refused callback reveals', () => {
		const cases = [
			['an existing email', 'admin@example.com'],
			['a new email', 'new@example.com']
		] as const;

		it.each(cases)('Invite-only with no invite answers the same for %s', async (_name, email) => {
			githubAnswers({ email });
			const h = await harness();

			const res = await h.signIn();

			expect(errorOf(res)).toBe('SIGN_UP_CLOSED');
			expect(
				new URL(res.headers.get('location') ?? '', origin).searchParams.has('error_description')
			).toBe(false);
			expect(await h.written()).toEqual(NOTHING);
		});

		it('Invite-only with an invalid invite answers the same for both too', async () => {
			for (const email of ['admin@example.com', 'new@example.com']) {
				githubAnswers({ email });
				const h = await harness();
				expect(errorOf(await h.signIn('A'.repeat(43)))).toBe('SIGN_UP_CLOSED');
			}
		});

		it.each(cases)('Open mode keeps its answer for %s', async (_name, email) => {
			githubAnswers({ email });
			const h = await harness({ mode: 'open' });

			const res = await h.signIn();

			if (email === 'admin@example.com') expect(errorOf(res)).toBe('account_not_linked');
			else expect(res.headers.get('location')).toBe('/');
		});

		it('an Account already linked to the provider still signs in once sign-up is closed', async () => {
			githubAnswers({});
			const h = await harness({ mode: 'open' });
			await h.signIn();
			h.setMode('invite');

			const res = await h.signIn();

			expect(res.headers.get('location')).toBe('/');
			expect(
				res.headers.getSetCookie().some((c) => c.startsWith('better-auth.session_token'))
			).toBe(true);
		});
	});

	it('stores the provider tokens encrypted', async () => {
		githubAnswers({});
		const h = await harness({ mode: 'open' });
		await h.signIn();

		const account = await h.db.account.findFirstOrThrow({ where: { providerId: 'github' } });

		expect(account.accessToken).toBeTruthy();
		expect(account.accessToken).not.toContain('gh-token');
	});

	it('clears the invite cookie after a sign-up through an Invite, and not otherwise', async () => {
		githubAnswers({});
		const h = await harness();
		const { token } = await h.made();

		const done = await h.signIn(token);
		const refused = await h.signIn();

		const cleared =
			done.headers.getSetCookie().find((c) => c.startsWith(`${INVITE_COOKIE}=`)) ?? '';
		expect(cleared).toMatch(/Max-Age=0/i);
		expect(cleared).toMatch(/Path=\/api\/auth/i);
		expect(refused.headers.getSetCookie().some((c) => c.startsWith(`${INVITE_COOKIE}=`))).toBe(
			false
		);
	});

	describe('what the log holds', () => {
		function spies() {
			vi.restoreAllMocks();
			return [
				vi.spyOn(console, 'error').mockImplementation(() => {}),
				vi.spyOn(console, 'warn').mockImplementation(() => {}),
				vi.spyOn(console, 'log').mockImplementation(() => {}),
				vi.spyOn(console, 'info').mockImplementation(() => {}),
				vi.spyOn(console, 'debug').mockImplementation(() => {})
			];
		}
		/** Each console call is one record; the text of every record written. */
		const records = (all: ReturnType<typeof spies>) =>
			all.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(' ')));

		it('a callback error parameter cannot forge a log line', async () => {
			const h = await harness({ mode: 'open' });
			const all = spies();

			await h.auth.handler(
				new Request(
					`${origin}/api/auth/callback/github?error=UNTRUSTED%0AFAKE-LOG-LINE%0D%0Aerror%20x`,
					{ headers: { [CLIENT_IP_HEADER]: '10.9.0.1' } }
				)
			);
			await h.auth.handler(
				new Request(`${origin}/api/auth/callback/github?code=c&state=bad%0AFAKE-LOG-LINE`, {
					headers: { [CLIENT_IP_HEADER]: '10.9.0.2' }
				})
			);

			const written = records(all);
			expect(written.length).toBeGreaterThan(0);
			for (const record of written) {
				expect(record).not.toMatch(/[\r\n]/);
				expect(record).not.toContain('FAKE-LOG-LINE');
				expect(record).not.toContain('UNTRUSTED');
			}
		});

		it('a provider error body is never logged', async () => {
			const h = await harness({ mode: 'open' });
			vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
				Response.json({
					error: 'bad_verification_code',
					error_description: 'PROVIDER-TEXT-SECRET',
					client_secret: 'LEAKED-SECRET'
				})
			);
			const all = spies();

			const res = await h.signIn();

			expect(errorOf(res)).not.toBeNull();
			const written = records(all);
			expect(written.length).toBeGreaterThan(0);
			const text = written.join('\n');
			expect(text).not.toContain('PROVIDER-TEXT-SECRET');
			expect(text).not.toContain('LEAKED-SECRET');
		});

		it('logs no caller text: a forged Origin, a callbackURL, a short value in ?error=, a made-up code', async () => {
			const h = await harness({ mode: 'open' });
			const all = spies();
			const signUp = (headers: Record<string, string>, ip: string) =>
				h.auth.handler(
					new Request(`${origin}/api/auth/sign-up/email`, {
						method: 'POST',
						headers: { 'content-type': 'application/json', [CLIENT_IP_HEADER]: ip, ...headers },
						body: JSON.stringify({
							...body,
							callbackURL: 'https://forged-callback-CALLERTEXT.example/x'
						})
					})
				);

			await signUp({ origin: 'https://forged-origin-CALLERTEXT.example' }, '10.9.0.3');
			await signUp({ origin }, '10.9.0.4');
			await h.auth.handler(
				new Request(`${origin}/api/auth/callback/github?error=CALLER_TEXT`, {
					headers: { [CLIENT_IP_HEADER]: '10.9.0.5' }
				})
			);
			redactingLogger(INVITE_LOG_PATTERNS).log(
				'error',
				'Failed',
				{ code: 'CALLER_CODE' },
				'CALLER_STRING'
			);

			const written = records(all);
			expect(written.length).toBeGreaterThan(0);
			for (const record of written) {
				expect(record).not.toMatch(/CALLER|forged/i);
			}
		});

		it('logs a recognized code, and only the fixed text of a message', () => {
			const all = spies();
			redactingLogger(INVITE_LOG_PATTERNS).log('error', 'Invalid origin: https://x.example', {
				code: 'INVALID_ORIGIN'
			});
			redactingLogger(INVITE_LOG_PATTERNS).log('error', 'See https://x.example/page for more');
			expect(records(all)).toEqual([
				'[Better Auth] Invalid origin code=INVALID_ORIGIN',
				'[Better Auth] [message omitted]'
			]);
		});

		it('keeps only a short code from an object, and nothing from a string that is not one', () => {
			const all = spies();
			redactingLogger(INVITE_LOG_PATTERNS).log(
				'error',
				'Line\nbreak‮',
				'two words',
				{ code: 'ECONNRESET', body: 'x' },
				{ message: 'free text' }
			);
			expect(records(all)).toEqual([
				'[Better Auth] Line break  [text omitted] code=ECONNRESET [object omitted]'
			]);
		});
	});

	it('stores no ID token in the Account row', async () => {
		githubAnswers({});
		const h = await harness({ mode: 'open' });
		await h.signIn();

		const account = await h.db.account.findFirstOrThrow({ where: { providerId: 'github' } });
		expect(account.idToken).toBeNull();
		// A second sign-in updates the Account and still stores none.
		await h.signIn();
		expect(
			(await h.db.account.findFirstOrThrow({ where: { providerId: 'github' } })).idToken
		).toBeNull();
	});

	describe('the invite cookie and the callback', () => {
		const cookieClears = (res: Response) =>
			res.headers.getSetCookie().find((c) => c.startsWith(`${INVITE_COOKIE}=`)) ?? '';

		it('is kept through the POST-to-GET bounce of a callback, which makes no session', async () => {
			githubAnswers({});
			const h = await harness();
			const { token } = await h.made();

			const res = await h.auth.handler(
				new Request(`${origin}/api/auth/callback/github`, {
					method: 'POST',
					headers: {
						'content-type': 'application/x-www-form-urlencoded',
						origin,
						cookie: `${INVITE_COOKIE}=${token}`,
						[CLIENT_IP_HEADER]: '10.8.0.1'
					},
					body: new URLSearchParams({ code: 'c', state: 's' })
				})
			);

			expect(res.status).toBe(302);
			expect(new URL(res.headers.get('location') ?? '', origin).pathname).toBe(
				'/api/auth/callback/github'
			);
			expect(cookieClears(res)).toBe('');
		});

		it('is kept through a refusal', async () => {
			githubAnswers({ email: 'admin@example.com' });
			const h = await harness({ mode: 'open' });
			const { token } = await h.made();

			const res = await h.signIn(token);

			expect(errorOf(res)).toBe('account_not_linked');
			expect(cookieClears(res)).toBe('');
		});

		it('is cleared by a success whose destination has an error in its query', async () => {
			githubAnswers({});
			const h = await harness();
			const { token } = await h.made();

			const res = await h.signIn(token, '/?error=anything');

			expect(res.headers.get('location')).toBe('/?error=anything');
			expect(cookieClears(res)).toMatch(/Max-Age=0/i);
		});
	});

	describe('the rewritten refusal', () => {
		it.each([['/.//evil.example/x'], ['/.//evil.example/x#frag']])(
			'never lands on another site: error page %j',
			async (errorPage) => {
				githubAnswers({ email: 'admin@example.com' });
				const h = await harness();

				const res = await h.signIn(undefined, '/', errorPage);

				expect(res.headers.get('location')).toBe('/signin?error=SIGN_UP_CLOSED');
			}
		);

		it('edits only the query of the page Better Auth was told', async () => {
			githubAnswers({ email: 'admin@example.com' });
			const h = await harness();

			const res = await h.signIn(undefined, '/', '/signin?next=%2Ftopics');

			expect(res.headers.get('location')).toBe('/signin?next=%2Ftopics&error=SIGN_UP_CLOSED');
		});
	});

	it('keeps the endpoints that would hand provider tokens to the browser off', async () => {
		const h = await harness();
		for (const path of ['refresh-token', 'get-access-token', 'account-info', 'list-accounts']) {
			const res = await h.auth.handler(
				new Request(`${origin}/api/auth/${path}`, { method: 'POST' })
			);
			expect(res.status, path).toBe(404);
		}
	});
});

describe('an Account is unique per provider identity', () => {
	it('refuses a second Account with the same providerId and accountId', async () => {
		const db = await createTestDb();
		for (const id of ['u1', 'u2']) {
			await db.learner.create({ data: { id: `l-${id}` } });
			await db.user.create({
				data: { id, name: id, email: `${id}@example.com`, learnerId: `l-${id}` }
			});
		}
		const account = (id: string, userId: string, providerId: string) => ({
			id,
			userId,
			providerId,
			accountId: 'google-sub-1'
		});
		await db.account.create({ data: account('a1', 'u1', 'google') });

		await expect(db.account.create({ data: account('a2', 'u2', 'google') })).rejects.toMatchObject({
			code: 'P2002'
		});
		// The same accountId under another provider is another identity.
		await db.account.create({ data: account('a3', 'u2', 'github') });
		expect(await db.account.count()).toBe(2);
	});
});

describe('a password sign-in racing a writer of the password', () => {
	const origin = 'http://localhost:3000';
	const oldPassword = 'correct horse battery';
	const newPassword = 'a brand new passphrase 42';
	const cookieOf = (headers: Headers) =>
		headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');

	async function world() {
		let admission: Admission = {};
		const { db, auth } = await createTestAuth({ admit: () => admission });
		const signUp = async (name: string, email: string, role?: 'admin') => {
			admission = role ? { role } : {};
			const res = await auth.api.signUpEmail({
				body: { name, email, password: oldPassword },
				returnHeaders: true
			});
			return { id: res.response.user.id, cookie: cookieOf(res.headers) };
		};
		const ada = await signUp('Ada', 'ada@example.com', 'admin');
		const lin = await signUp('Lin', 'lin@example.com');
		const { internalAdapter } = await auth.$context;
		const sessionsOf = (userId: string) => db.session.count({ where: { userId } });
		const resolves = async (cookie: string) =>
			(await auth.api.getSession({ headers: new Headers({ cookie }) })) !== null;
		const generationOf = async (userId: string) =>
			(await db.account.findFirstOrThrow({ where: { userId, providerId: 'credential' } }))
				.credentialGeneration;

		/** Holds the next session a sign-in is about to create until `release` is called: the password has been checked. */
		function holdNextSession() {
			const real = internalAdapter.createSession.bind(internalAdapter);
			let release: () => void = () => {};
			let reached: () => void = () => {};
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const reachedGate = new Promise<void>((resolve) => {
				reached = resolve;
			});
			vi.spyOn(internalAdapter, 'createSession').mockImplementationOnce(async (...args) => {
				reached();
				await gate;
				return real(...args);
			});
			return { reached: reachedGate, release };
		}
		const signIn = (email: string, password = oldPassword) =>
			auth.api.signInEmail({ body: { email, password } }).then(
				(r) => ({ ok: true as const, r }),
				(error: unknown) => ({ ok: false as const, error })
			);
		/** The admin asking: what Identity would make of their cookie. */
		const who = async (cookie: string) => {
			const { learnerId } = await db.user.findUniqueOrThrow({
				where: { email: 'ada@example.com' }
			});
			return {
				who: { learnerId, displayName: 'Ada', role: 'admin' as const },
				headers: new Headers({ cookie })
			};
		};
		onTestFinished(() => {
			vi.restoreAllMocks();
		});
		return {
			db,
			auth,
			ada,
			lin,
			internalAdapter,
			sessionsOf,
			resolves,
			generationOf,
			holdNextSession,
			signIn,
			who
		};
	}

	/** A refusal like a wrong password: 401, a fixed message, no cookie. */
	const refused = (outcome: { ok: boolean; error?: unknown }) => {
		expect(outcome.ok).toBe(false);
		expect(outcome.error).toMatchObject({
			statusCode: 401,
			body: { code: 'INVALID_EMAIL_OR_PASSWORD' }
		});
	};

	it("is refused when an admin's reset lands between the check and the session", async () => {
		const w = await world();
		const hold = w.holdNextSession();
		const racing = w.signIn('lin@example.com');
		await hold.reached;

		await resetPassword(w.auth, { ...(await w.who(w.ada.cookie)), userId: w.lin.id });
		hold.release();

		refused(await racing);
		expect(await w.sessionsOf(w.lin.id)).toBe(0);
	});

	it('is refused when the reset command lands between the check and the session', async () => {
		const w = await world();
		const hold = w.holdNextSession();
		const racing = w.signIn('ada@example.com');
		await hold.reached;

		await resetAdminPassword(w.auth);
		hold.release();

		refused(await racing);
		expect(await w.sessionsOf(w.ada.id)).toBe(0);
	});

	it("is refused when a password change lands between the check and the session, which keeps only the change's own", async () => {
		const w = await world();
		const hold = w.holdNextSession();
		const racing = w.signIn('lin@example.com');
		await hold.reached;

		const changed = await w.auth.api.changePassword({
			headers: new Headers({ cookie: w.lin.cookie }),
			body: { currentPassword: oldPassword, newPassword, revokeOtherSessions: true }
		});
		hold.release();

		refused(await racing);
		expect(changed.token).toBeTruthy();
		expect(await w.sessionsOf(w.lin.id)).toBe(1);
		expect(
			await w.db.session.count({ where: { userId: w.lin.id, token: changed.token ?? '' } })
		).toBe(1);
	});

	it('is refused, and removes its own session, when the writer lands between the check and the insert', async () => {
		const w = await world();
		const real = w.db.account.findFirst.bind(w.db.account);
		let reads = 0;
		// The reads of a sign-in are: the request hook, the check before the insert, the check after it. The writer
		// lands right after the second returned.
		vi.spyOn(w.db.account, 'findFirst').mockImplementation(((args: never) => {
			reads += 1;
			const answer = real(args);
			if (reads !== 2) return answer;
			return answer.then(async (value) => {
				await resetPassword(w.auth, { ...(await w.who(w.ada.cookie)), userId: w.lin.id });
				return value;
			});
		}) as never);

		const outcome = await w.signIn('lin@example.com');

		refused(outcome);
		expect(reads).toBeGreaterThanOrEqual(3);
		expect(await w.sessionsOf(w.lin.id)).toBe(0);
	});

	it('fails closed when the hook found no Account that the sign-in then finds (made in between)', async () => {
		const w = await world();
		vi.spyOn(w.db.user, 'findUnique').mockResolvedValueOnce(null);

		const outcome = await w.signIn('lin@example.com');

		refused(outcome);
		expect(await w.sessionsOf(w.lin.id)).toBe(1); // only the sign-up's
	});

	it('fails closed when the record names another user than the one signed in', async () => {
		const w = await world();
		vi.spyOn(w.db.user, 'findUnique').mockResolvedValueOnce({ id: w.ada.id } as never);

		const outcome = await w.signIn('lin@example.com');

		refused(outcome);
		expect(await w.sessionsOf(w.lin.id)).toBe(1);
	});

	it('fails closed for a sign-in with no record at all', async () => {
		const w = await world();
		// A session created in a sign-in request whose hook never ran: not a path that is exempt.
		await expect(w.internalAdapter.createSession(w.lin.id)).rejects.toMatchObject({
			statusCode: 401
		});
		expect(await w.sessionsOf(w.lin.id)).toBe(1);
	});

	it("names its exemptions: sign-up, a provider callback and the change's own session still get sessions", async () => {
		const w = await world();
		const signedUp = await w.auth.api.signUpEmail({
			body: { name: 'New', email: 'new@example.com', password: oldPassword }
		});
		expect(signedUp.token).toBeTruthy();
		const changed = await w.auth.api.changePassword({
			headers: new Headers({ cookie: w.lin.cookie }),
			body: { currentPassword: oldPassword, newPassword, revokeOtherSessions: true }
		});
		expect(changed.token).toBeTruthy();
	});

	it.each(['list-sessions', 'revoke-session', 'revoke-sessions', 'revoke-other-sessions'])(
		'serves %s over HTTP no more, but keeps sign-out',
		async (path) => {
			const w = await world();
			const res = await w.auth.handler(
				new Request(`${origin}/api/auth/${path}`, {
					method: path === 'list-sessions' ? 'GET' : 'POST',
					headers: { cookie: w.lin.cookie, origin, 'content-type': 'application/json' },
					body: path === 'list-sessions' ? undefined : '{}'
				})
			);
			expect(res.status).toBe(404);
			const signOut = await w.auth.handler(
				new Request(`${origin}/api/auth/sign-out`, {
					method: 'POST',
					headers: { cookie: w.lin.cookie, origin, 'content-type': 'application/json' },
					body: '{}'
				})
			);
			expect(signOut.status).not.toBe(404);
		}
	);

	it('still signs in with the new password after each writer, and with the old one before', async () => {
		const w = await world();
		expect((await w.signIn('lin@example.com')).ok).toBe(true);

		const { password: fresh } = await resetPassword(w.auth, {
			...(await w.who(w.ada.cookie)),
			userId: w.lin.id
		});

		expect((await w.signIn('lin@example.com', fresh)).ok).toBe(true);
		expect((await w.signIn('lin@example.com')).ok).toBe(false);
	});

	it('leaves other sign-ins alone: a race on one Account does not touch another', async () => {
		const w = await world();
		const hold = w.holdNextSession();
		const racing = w.signIn('lin@example.com');
		await hold.reached;
		await resetAdminPassword(w.auth);
		hold.release();

		expect((await racing).ok).toBe(true);
		expect(await w.sessionsOf(w.lin.id)).toBe(2); // the sign-up's and this one
	});

	// Better Auth 1.7.8 (#11626) ends the other sessions before it writes the new hash, so a change whose revocation
	// fails stops there: the password is not kept. (The Prisma adapter runs without a transaction, so this is the
	// order of the steps, not a rollback.) The generation binding is for the writers that do keep the password.
	it('keeps nothing of a password change whose two deletions both failed', async () => {
		const w = await world();
		const before = await w.generationOf(w.lin.id);
		vi.spyOn(w.internalAdapter, 'deleteUserSessions').mockRejectedValue(new Error('disk'));
		vi.spyOn(w.internalAdapter, 'deleteSessions').mockRejectedValue(new Error('disk'));

		await expect(
			w.auth.api.changePassword({
				headers: new Headers({ cookie: w.lin.cookie }),
				body: { currentPassword: oldPassword, newPassword, revokeOtherSessions: true }
			})
		).rejects.toThrow();

		// The password and its generation are as they were, so the session that is still there is still the right one.
		expect(await w.generationOf(w.lin.id)).toBe(before);
		expect(await w.sessionsOf(w.lin.id)).toBe(1);
		expect(await w.resolves(w.lin.cookie)).toBe(true);
		expect((await w.signIn('lin@example.com', newPassword)).ok).toBe(false);
		expect((await w.signIn('lin@example.com', oldPassword)).ok).toBe(true);
	});

	it('refuses a session from before a password change that ended no session', async () => {
		const w = await world();
		const before = await w.generationOf(w.lin.id);
		// Without `revokeOtherSessions` the change deletes nothing, as a change whose deletions all failed would
		// have left things: the old row is there, and only its generation says it is from before the password.
		await w.auth.api.changePassword({
			headers: new Headers({ cookie: w.lin.cookie }),
			body: { currentPassword: oldPassword, newPassword }
		});

		expect(await w.generationOf(w.lin.id)).not.toBe(before);
		expect(await w.sessionsOf(w.lin.id)).toBe(1);
		expect(await w.resolves(w.lin.cookie)).toBe(false);
	});

	it('does not touch a session made after the password was set', async () => {
		const w = await world();
		await w.auth.api.changePassword({
			headers: new Headers({ cookie: w.lin.cookie }),
			body: { currentPassword: oldPassword, newPassword, revokeOtherSessions: true }
		});
		const { response, headers } = await w.auth.api
			.signInEmail({
				body: { email: 'lin@example.com', password: newPassword },
				returnHeaders: true
			})
			.then((r) => r);

		const found = await w.auth.api.getSession({
			headers: new Headers({ cookie: cookieOf(headers) })
		});

		expect(response.user.email).toBe('lin@example.com');
		expect(found?.user.email).toBe('lin@example.com');
	});

	it("checks no password for a session a provider makes: a sign-up and the change's fresh session carry no record", async () => {
		const w = await world();
		const created = await w.auth.api.signUpEmail({
			body: { name: 'New', email: 'new@example.com', password: oldPassword },
			returnHeaders: true
		});
		const found = await w.auth.api.getSession({
			headers: new Headers({ cookie: cookieOf(created.headers) })
		});
		expect(found?.user.email).toBe('new@example.com');
	});
});

describe('a session is bound to its credential generation', () => {
	const oldPassword = 'correct horse battery';
	const newPassword = 'a brand new passphrase 42';
	const cookieOf = (headers: Headers) =>
		headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
	/** The cookie a browser would hold for a session row, signed as Better Auth signs it. */
	const cookieForToken = (token: string) =>
		`better-auth.session_token=${encodeURIComponent(
			`${token}.${createHmac('sha256', TEST_SECRET).update(token).digest('base64')}`
		)}`;

	async function world() {
		let admission: Admission = {};
		const { db, auth } = await createTestAuth({ admit: () => admission });
		const signUp = async (name: string, email: string, role?: 'admin') => {
			admission = role ? { role } : {};
			const res = await auth.api.signUpEmail({
				body: { name, email, password: oldPassword },
				returnHeaders: true
			});
			return { id: res.response.user.id, cookie: cookieOf(res.headers) };
		};
		const ada = await signUp('Ada', 'ada@example.com', 'admin');
		const lin = await signUp('Lin', 'lin@example.com');
		const { internalAdapter } = await auth.$context;
		const resolves = async (cookie: string) =>
			(await auth.api.getSession({ headers: new Headers({ cookie }) })) !== null;
		const generationOf = async (userId: string) =>
			(await db.account.findFirstOrThrow({ where: { userId, providerId: 'credential' } }))
				.credentialGeneration;
		const who = async () => {
			const { learnerId } = await db.user.findUniqueOrThrow({
				where: { email: 'ada@example.com' }
			});
			return {
				who: { learnerId, displayName: 'Ada', role: 'admin' as const },
				headers: new Headers({ cookie: ada.cookie })
			};
		};
		/** Every way to delete a session fails: the writers' and the cleanup's. */
		const breakEveryDeletion = () => {
			vi.spyOn(internalAdapter, 'deleteUserSessions').mockRejectedValue(new Error('disk'));
			vi.spyOn(internalAdapter, 'deleteSessions').mockRejectedValue(new Error('disk'));
			vi.spyOn(db.session, 'deleteMany').mockRejectedValue(new Error('disk'));
		};
		onTestFinished(() => {
			vi.restoreAllMocks();
		});
		return { db, auth, ada, lin, internalAdapter, resolves, generationOf, who, breakEveryDeletion };
	}

	it('the signing helper makes a cookie that resolves a live session', async () => {
		const w = await world();
		const row = await w.db.session.findFirstOrThrow({ where: { userId: w.lin.id } });
		expect(await w.resolves(cookieForToken(row.token))).toBe(true);
	});

	it('binds a new session to the generation of its password Account, and "" with none', async () => {
		const w = await world();
		const row = await w.db.session.findFirstOrThrow({ where: { userId: w.lin.id } });
		expect(row.credentialGeneration).toBe(await w.generationOf(w.lin.id));
		expect(row.credentialGeneration).not.toBe('');
		// An Account with no password Account.
		await w.db.account.deleteMany({ where: { userId: w.lin.id } });
		const created = await w.internalAdapter.createSession(w.lin.id).catch((e: unknown) => e);
		expect(created).toMatchObject({ statusCode: 401 }); // not a request: no named exemption
	});

	it.each([
		[
			'the admin reset',
			async (w: Awaited<ReturnType<typeof world>>) => {
				await resetPassword(w.auth, { ...(await w.who()), userId: w.lin.id });
			}
		],
		[
			'a password change',
			async (w: Awaited<ReturnType<typeof world>>) => {
				await w.auth.api.changePassword({
					headers: new Headers({ cookie: w.lin.cookie }),
					body: { currentPassword: oldPassword, newPassword }
				});
			}
		],
		[
			'the reset command',
			async (w: Awaited<ReturnType<typeof world>>) => {
				await resetAdminPassword(w.auth);
			}
		]
	])('%s replaces the generation in the write that replaces the hash', async (_name, write) => {
		const w = await world();
		const target = _name === 'the reset command' ? w.ada.id : w.lin.id;
		const before = await w.generationOf(target);
		const hashBefore = (
			await w.db.account.findFirstOrThrow({ where: { userId: target, providerId: 'credential' } })
		).password;

		await write(w);

		const after = await w.db.account.findFirstOrThrow({
			where: { userId: target, providerId: 'credential' }
		});
		expect(after.password).not.toBe(hashBefore);
		expect(after.credentialGeneration).not.toBe(before);
	});

	it('does not touch the generation when the password does not change', async () => {
		const w = await world();
		const before = await w.generationOf(w.lin.id);
		await w.auth.api.signInEmail({ body: { email: 'lin@example.com', password: oldPassword } });
		expect(await w.generationOf(w.lin.id)).toBe(before);
	});

	// A password change with every deletion failing is not here: it stops before the hash is written (above). The
	// admin's reset keeps the password whatever the deletions do (`setUserPassword` ends nothing itself), so
	// the binding is what refuses the old session.
	it.each([
		[
			'the admin reset',
			async (w: Awaited<ReturnType<typeof world>>) => {
				await resetPassword(w.auth, { ...(await w.who()), userId: w.lin.id }).catch(
					() => undefined
				);
			}
		]
	])(
		'%s with every deletion failing: the old session is refused at resolution',
		async (_name, write) => {
			const w = await world();
			w.breakEveryDeletion();

			await write(w);

			const rows = await w.db.session.findMany({ where: { userId: w.lin.id } });
			expect(rows.length).toBeGreaterThan(0); // nothing could be deleted
			expect(await w.resolves(w.lin.cookie)).toBe(false);
		}
	);

	it('a sign-in that lands inside the credential write, with every deletion failing, never resolves', async () => {
		const w = await world();
		const real = w.db.account.findFirst.bind(w.db.account);
		let reads = 0;
		// The reads of a sign-in are: the request hook, the check before the insert. The writer lands right after
		// the second returned, then every deletion is broken, then the session is inserted.
		vi.spyOn(w.db.account, 'findFirst').mockImplementation(((args: never) => {
			reads += 1;
			const answer = real(args);
			if (reads !== 2) return answer;
			return answer.then(async (value) => {
				await w.auth.api.changePassword({
					headers: new Headers({ cookie: w.lin.cookie }),
					body: { currentPassword: oldPassword, newPassword, revokeOtherSessions: true }
				});
				w.breakEveryDeletion();
				return value;
			});
		}) as never);

		const outcome = await w.auth.api
			.signInEmail({ body: { email: 'lin@example.com', password: oldPassword } })
			.then(
				() => 'signed in',
				(error: unknown) => (error as { statusCode?: number }).statusCode
			);

		expect(outcome).toBe(401);
		// The row may be there (nothing could delete it), but it holds the old generation and resolves nowhere.
		const stale = await w.db.session.findMany({
			where: { userId: w.lin.id, credentialGeneration: { not: await w.generationOf(w.lin.id) } }
		});
		for (const row of stale) expect(await w.resolves(cookieForToken(row.token))).toBe(false);
		expect(stale.length).toBeGreaterThan(0);
	});

	it('a refused sign-in leaves no session row when the writer lands before the check', async () => {
		const w = await world();
		const real = w.internalAdapter.createSession.bind(w.internalAdapter);
		let release: () => void = () => {};
		let reached: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const reachedGate = new Promise<void>((resolve) => {
			reached = resolve;
		});
		vi.spyOn(w.internalAdapter, 'createSession').mockImplementationOnce(async (...args) => {
			reached();
			await gate;
			return real(...args);
		});
		const racing = w.auth.api
			.signInEmail({ body: { email: 'lin@example.com', password: oldPassword } })
			.then(
				() => 'signed in',
				(error: unknown) => (error as { statusCode?: number }).statusCode
			);
		await reachedGate;
		await resetPassword(w.auth, { ...(await w.who()), userId: w.lin.id });
		const before = await w.db.session.count({ where: { userId: w.lin.id } });
		release();

		expect(await racing).toBe(401);
		expect(await w.db.session.count({ where: { userId: w.lin.id } })).toBe(before);
		expect(before).toBe(0);
	});

	it('a session older than updateAge is refreshed on resolution, and still resolves with its generation', async () => {
		const w = await world();
		const row = await w.db.session.findFirstOrThrow({ where: { userId: w.lin.id } });
		// Better Auth refreshes when the session is older than a day: judged from `expiresAt` (7 days from creation).
		const aged = new Date(Date.now() + 5 * 24 * 3600 * 1000);
		await w.db.session.update({ where: { id: row.id }, data: { expiresAt: aged } });

		const found = await w.auth.api.getSession({ headers: new Headers({ cookie: w.lin.cookie }) });

		expect(found?.user.email).toBe('lin@example.com');
		const after = await w.db.session.findUniqueOrThrow({ where: { id: row.id } });
		expect(after.expiresAt.getTime()).toBeGreaterThan(aged.getTime() + 24 * 3600 * 1000); // the refresh branch ran
		expect(after.credentialGeneration).toBe(row.credentialGeneration);
		expect(await w.resolves(w.lin.cookie)).toBe(true);
	});

	it('an OAuth-only session holds "" and resolves, and stops once a password Account is created for the user', async () => {
		const w = await world();
		await w.db.learner.create({ data: { id: 'oz-learner' } });
		await w.db.user.create({
			data: { id: 'oz', name: 'Oz', email: 'oz@example.com', learnerId: 'oz-learner' }
		});
		await w.db.account.create({
			data: { id: 'oz-gh', accountId: '99', providerId: 'github', userId: 'oz' }
		});
		await w.db.session.create({
			data: {
				id: 'oz-s',
				token: 'oz-token',
				userId: 'oz',
				expiresAt: new Date(Date.now() + 1e9),
				credentialGeneration: ''
			}
		});
		const cookie = cookieForToken('oz-token');
		expect(await w.resolves(cookie)).toBe(true);

		// A password write: the Account now has a credential, and every earlier session ends.
		await w.internalAdapter.linkAccount({
			userId: 'oz',
			providerId: 'credential',
			accountId: 'oz',
			password: 'hash'
		});

		expect(await w.resolves(cookie)).toBe(false);
	});

	it('resolution, the sweep and the migration pick the same password Account, even with an odd second credential row', async () => {
		const w = await world();
		const real = await w.db.account.findFirstOrThrow({
			where: { userId: w.lin.id, providerId: 'credential', accountId: w.lin.id }
		});
		// Not a row Better Auth makes (and the unique index allows it): another accountId, a newer update.
		await w.db.account.create({
			data: {
				id: 'odd',
				accountId: 'someone-else',
				providerId: 'credential',
				userId: w.lin.id,
				password: 'x',
				credentialGeneration: 'the-odd-generation',
				updatedAt: new Date(Date.now() + 60_000)
			}
		});

		expect(await w.resolves(w.lin.cookie)).toBe(true);
		const { sweepStaleSessions } = await import('./multi-user.ts');
		expect(await sweepStaleSessions(w.db)).toBe(0);
		expect(await w.resolves(w.lin.cookie)).toBe(true);
		// And a sign-in binds to the real one.
		await w.auth.api.signInEmail({ body: { email: 'lin@example.com', password: oldPassword } });
		const rows = await w.db.session.findMany({ where: { userId: w.lin.id } });
		expect(new Set(rows.map((r) => r.credentialGeneration))).toEqual(
			new Set([real.credentialGeneration])
		);
	});

	it('removing an Account removes its sessions with the column', async () => {
		const w = await world();
		await w.db.user.delete({ where: { id: w.lin.id } });
		expect(await w.db.session.count({ where: { userId: w.lin.id } })).toBe(0);
	});
});

// Better Auth 1.7.8 aligned cookie attributes with RFC 6265bis (#11540). The session cookie on a plain-http Instance
// that is not localhost (a LAN name) must stay one the browser keeps: no Secure, no __Secure- prefix.
describe('the session cookie by scheme', () => {
	const signedUpWith = async (origin: string) => {
		const { auth } = await createTestAuth({ origin });
		const { headers } = await auth.api.signUpEmail({ body, returnHeaders: true });
		return headers.getSetCookie().filter((c) => c.includes('session_token'));
	};

	it('is not Secure on a plain-http origin that is not localhost, and is HttpOnly with SameSite Lax', async () => {
		const cookies = await signedUpWith('http://learn.lan:3000');

		expect(cookies).toHaveLength(1);
		expect(cookies[0]).toMatch(/^better-auth\.session_token=/);
		expect(cookies[0]).not.toMatch(/;\s*Secure/i);
		expect(cookies[0]).toMatch(/;\s*HttpOnly/i);
		expect(cookies[0]).toMatch(/;\s*SameSite=Lax/i);
	});

	it('is Secure and prefixed on an https origin', async () => {
		const cookies = await signedUpWith('https://learn.example.com');

		expect(cookies[0]).toMatch(/^__Secure-better-auth\.session_token=/);
		expect(cookies[0]).toMatch(/;\s*Secure/i);
	});
});
