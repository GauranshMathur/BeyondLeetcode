import { readFileSync } from 'node:fs';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { createInstance } from '../instance.ts';
import { createFileTestDb } from '../test-db.ts';
import {
	type Admission,
	CLIENT_IP_HEADER,
	createAuth,
	hasForbiddenNameCharacter,
	isNameTooLong,
	isPlaceholderSecret,
	MAX_NAME_LENGTH,
	MIN_PASSWORD_LENGTH
} from './auth.ts';
import { createRegistration } from './registration.ts';
import { createFirstAdmin } from './setup.ts';

const secret = 'test-secret-test-secret-test-secret-0123';
const body = { email: 'ada@example.com', password: 'correct horse battery', name: 'Ada' };

async function setup(admitSignUp: () => Admission | null | Promise<Admission | null> = () => ({})) {
	const db = await createFileTestDb();
	const auth = createAuth({ db, origin: 'http://localhost:3000', secret, admitSignUp });
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
		const auth = createAuth({ db, origin: '', secret });

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
		const closed = createAuth({ db, origin: '', secret });

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

	it('serves no admin endpoint we do not use over HTTP', async () => {
		const { auth } = await setup();
		for (const path of [
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
			'list-accounts'
		]) {
			const res = await auth.handler(
				new Request(`http://localhost:3000/api/auth/${path}`, { method: 'POST' })
			);
			expect(res.status, path).toBe(404);
		}
		for (const [method, path] of [
			['POST', 'sign-out'],
			['GET', 'get-session'],
			['POST', 'change-password']
		] as const) {
			const res = await auth.handler(
				new Request(`http://localhost:3000/api/auth/${path}`, { method })
			);
			expect(res.status, path).not.toBe(404);
		}
		const kept = await auth.handler(
			new Request('http://localhost:3000/api/auth/admin/list-users', { method: 'GET' })
		);
		expect(kept.status).not.toBe(404);
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
		const db = await createFileTestDb();
		const instance = await createInstance(db);
		const auth = createAuth({
			db,
			origin: 'http://localhost:3000',
			secret,
			admitSignUp: createRegistration({ instance })
		});

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
		const db = await createFileTestDb();
		const instance = await createInstance(db);
		const auth = createAuth({
			db,
			origin: 'http://localhost:3000',
			secret,
			admitSignUp: createRegistration({ instance })
		});

		await expect(
			createFirstAdmin({ instance, auth, db }, { ...body, name: at(0x202e) })
		).rejects.toMatchObject({ body: { code: 'NAME_INVALID_CHARACTERS' } });

		expect(instance.mode()).toBeNull();
		expect(await db.user.count()).toBe(0);
		expect(await db.learner.count()).toBe(0);
	});
});
