import { describe, expect, it, vi } from 'vitest';
import { createFileTestDb } from '../test-db.ts';
import {
	type AccountRow,
	listAccounts,
	NotAdminError,
	resetPassword,
	SelfResetError,
	UnknownAccountError
} from './accounts.ts';
import { type Admission, type Auth, createAuth } from './auth.ts';
import { createMultiUserIdentity } from './multi-user.ts';

const secret = 'test-secret-test-secret-test-secret-0123';
const password = 'correct horse battery staple';

async function setup() {
	const db = await createFileTestDb();
	let admission: Admission = {};
	const auth = createAuth({
		db,
		origin: 'http://localhost:3000',
		secret,
		admitSignUp: () => admission
	});
	const resolver = createMultiUserIdentity(auth);

	/** Signs an Account up (as an admin when asked) and returns the session cookie header it got. */
	async function signUp(name: string, email: string, role?: 'admin') {
		admission = role ? { role } : {};
		const { headers } = await auth.api.signUpEmail({
			body: { name, email, password },
			returnHeaders: true
		});
		return {
			cookie: headers
				.getSetCookie()
				.map((c) => c.split(';')[0])
				.join('; ')
		};
	}

	/** What Identity makes of a session cookie: the `who` and the headers a request would carry. */
	async function requestOf(cookie: string) {
		const headers = new Headers({ cookie });
		const who = await resolver.resolve({
			cookies: { get: () => undefined },
			request: { headers }
		});
		if (!who) throw new Error('the cookie resolves to nobody');
		return { who, headers };
	}

	return { db, auth, signUp, requestOf };
}

describe('listAccounts', () => {
	it('shows the admin every Account, oldest first, as name, email, role and join date', async () => {
		const { auth, db, signUp, requestOf } = await setup();
		const admin = await signUp('Ada Admin', 'ada@example.com', 'admin');
		await signUp('Lin Learner', 'lin@example.com');
		await signUp('Max Learner', 'max@example.com');
		const ada = await db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });

		const rows = await listAccounts(auth, await requestOf(admin.cookie));

		expect(rows).toEqual([
			{
				id: ada.id,
				name: 'Ada Admin',
				email: 'ada@example.com',
				role: 'admin',
				joined: ada.createdAt.toISOString(),
				you: true
			},
			expect.objectContaining({ name: 'Lin Learner', email: 'lin@example.com', role: 'learner' }),
			expect.objectContaining({ name: 'Max Learner', email: 'max@example.com', role: 'learner' })
		]);
		expect(rows.map((r) => r.you)).toEqual([true, false, false]);
		expect(rows.map((r) => r.joined)).toEqual([...rows.map((r) => r.joined)].sort());
	});

	it('hands the page only what it draws: never a hash, a Learner id, a ban or a password flag', async () => {
		const { auth, signUp, requestOf } = await setup();
		const admin = await signUp('Ada Admin', 'ada@example.com', 'admin');
		await signUp('Lin Learner', 'lin@example.com');

		const rows = await listAccounts(auth, await requestOf(admin.cookie));

		for (const row of rows) {
			expect(Object.keys(row).sort()).toEqual(['email', 'id', 'joined', 'name', 'role', 'you']);
		}
	});

	it('marks only the viewer own row as "you", found by Learner, so a shared name or email proves nothing', async () => {
		const { auth, db, signUp, requestOf } = await setup();
		const admin = await signUp('Ada Admin', 'ada@example.com', 'admin');
		await signUp('Ada Admin', 'ada.two@example.com');
		const [first, second] = await db.user.findMany({ orderBy: { createdAt: 'asc' } });

		const rows = await listAccounts(auth, await requestOf(admin.cookie));

		expect(rows.find((r) => r.id === first.id)?.you).toBe(true);
		expect(rows.find((r) => r.id === second.id)?.you).toBe(false);
	});

	it('lists past the 100 Accounts the plugin returns in one page', async () => {
		const { auth, db, signUp, requestOf } = await setup();
		const admin = await signUp('Ada Admin', 'ada@example.com', 'admin');
		const start = Date.now();
		const many = Array.from({ length: 230 }, (_, i) => ({
			id: `user-${i}`,
			name: `User ${i}`,
			email: `user${i}@example.com`,
			learnerId: `learner-${i}`,
			createdAt: new Date(start + (i + 1) * 1000)
		}));
		await db.learner.createMany({ data: many.map((u) => ({ id: u.learnerId })) });
		await db.user.createMany({ data: many });

		const rows = await listAccounts(auth, await requestOf(admin.cookie));

		expect(rows).toHaveLength(231);
		expect(new Set(rows.map((r) => r.id)).size).toBe(231);
		expect(rows[0].email).toBe('ada@example.com');
		expect(rows[230].email).toBe('user229@example.com');
	});

	it('shows a role as the app treats it: admin exactly, everything else learner', async () => {
		const { auth, db, signUp, requestOf } = await setup();
		const admin = await signUp('Ada Admin', 'ada@example.com', 'admin');
		await signUp('Comma', 'comma@example.com');
		await signUp('Blank', 'blank@example.com');
		await signUp('Shouty', 'shouty@example.com');
		await db.user.update({
			where: { email: 'comma@example.com' },
			data: { role: 'admin,learner' }
		});
		await db.user.update({ where: { email: 'blank@example.com' }, data: { role: null } });
		await db.user.update({ where: { email: 'shouty@example.com' }, data: { role: 'Admin' } });

		const rows = await listAccounts(auth, await requestOf(admin.cookie));

		const roles = Object.fromEntries(rows.map((r) => [r.email, r.role]));
		expect(roles).toEqual({
			'ada@example.com': 'admin',
			'comma@example.com': 'learner',
			'blank@example.com': 'learner',
			'shouty@example.com': 'learner'
		});
	});

	describe('who may ask', () => {
		it('refuses a learner, and asks the plugin nothing', async () => {
			const { auth, signUp, requestOf } = await setup();
			await signUp('Ada Admin', 'ada@example.com', 'admin');
			const learner = await signUp('Lin Learner', 'lin@example.com');
			const listUsers = vi.spyOn(auth.api, 'listUsers');

			await expect(listAccounts(auth, await requestOf(learner.cookie))).rejects.toBeInstanceOf(
				NotAdminError
			);

			expect(listUsers).not.toHaveBeenCalled();
		});

		it('refuses a role that only contains admin ("admin,learner"), although the plugin would answer it', async () => {
			const { auth, db, signUp, requestOf } = await setup();
			await signUp('Ada Admin', 'ada@example.com', 'admin');
			const sneaky = await signUp('Sam Sneaky', 'sam@example.com');
			await db.user.update({
				where: { email: 'sam@example.com' },
				data: { role: 'admin,learner' }
			});
			const request = await requestOf(sneaky.cookie);

			// The plugin splits the role on commas, so on its own check Sam may list every Account ...
			const throughThePlugin = await auth.api.listUsers({ headers: request.headers, query: {} });
			expect(throughThePlugin.users).toHaveLength(2);
			// ... but Identity says learner, and that is what every admin action must go by.
			expect(request.who.role).toBe('learner');
			await expect(listAccounts(auth, request)).rejects.toBeInstanceOf(NotAdminError);
		});

		it('refuses when the plugin refuses, e.g. the admin session ended a moment ago', async () => {
			const { auth, db, signUp, requestOf } = await setup();
			const admin = await signUp('Ada Admin', 'ada@example.com', 'admin');
			const request = await requestOf(admin.cookie);
			await db.session.deleteMany();

			await expect(listAccounts(auth, request)).rejects.toBeInstanceOf(NotAdminError);
		});

		it('refuses an admin whose role changed to learner between the two checks', async () => {
			const { auth, db, signUp, requestOf } = await setup();
			const admin = await signUp('Ada Admin', 'ada@example.com', 'admin');
			const request = await requestOf(admin.cookie);
			await db.user.update({ where: { email: 'ada@example.com' }, data: { role: 'learner' } });

			await expect(listAccounts(auth, request)).rejects.toBeInstanceOf(NotAdminError);
		});
	});

	describe('when the plugin cannot read', () => {
		// The plugin answers any database failure with an empty list; an admin always exists, so an
		// empty list is a failure, never "no Accounts".
		const failing = (answer: unknown) =>
			({ api: { listUsers: vi.fn(async () => answer) } }) as unknown as Auth;
		const admin = { learnerId: 'local', displayName: 'Ada', role: 'admin' as const };

		it('fails loudly on an empty list instead of showing an empty table', async () => {
			const auth = failing({ users: [], total: 0 });

			await expect(listAccounts(auth, { who: admin, headers: new Headers() })).rejects.toThrow(
				'could not be read'
			);
		});

		it('stops on a short page rather than asking for ever', async () => {
			const user = {
				id: 'a',
				name: 'A',
				email: 'a@example.com',
				role: 'admin',
				createdAt: new Date()
			};
			const listUsers = vi
				.fn()
				.mockResolvedValueOnce({ users: [user], total: 5 })
				.mockResolvedValueOnce({ users: [], total: 5 });
			const auth = { api: { listUsers } } as unknown as Auth;

			const rows: AccountRow[] = await listAccounts(auth, { who: admin, headers: new Headers() });

			expect(rows).toHaveLength(1);
			expect(listUsers).toHaveBeenCalledTimes(2);
		});
	});
});

describe('resetPassword', () => {
	async function twoAccounts() {
		const s = await setup();
		const admin = await s.signUp('Ada Admin', 'ada@example.com', 'admin');
		const lin = await s.signUp('Lin Learner', 'lin@example.com');
		const linRow = await s.db.user.findUniqueOrThrow({ where: { email: 'lin@example.com' } });
		return { ...s, admin, lin, linRow };
	}
	const signIn = (auth: Auth, email: string, pw: string) =>
		auth.api.signInEmail({ body: { email, password: pw } });
	const sessionOf = (auth: Auth, cookie: string) =>
		auth.api.getSession({ headers: new Headers({ cookie }) });

	it('sets a new password that signs in, and the old one stops working', async () => {
		const { auth, admin, linRow, requestOf } = await twoAccounts();

		const { password: fresh } = await resetPassword(auth, {
			...(await requestOf(admin.cookie)),
			userId: linRow.id
		});

		await expect(signIn(auth, 'lin@example.com', password)).rejects.toThrow();
		const signedIn = await signIn(auth, 'lin@example.com', fresh);
		expect(signedIn.user.email).toBe('lin@example.com');
	});

	it('makes a long random password each time, within the password limits', async () => {
		const { auth, admin, linRow, requestOf } = await twoAccounts();
		const request = { ...(await requestOf(admin.cookie)), userId: linRow.id };

		const a = (await resetPassword(auth, request)).password;
		const b = (await resetPassword(auth, request)).password;

		expect(a).not.toBe(b);
		for (const p of [a, b]) {
			expect(p.length).toBeGreaterThanOrEqual(16);
			expect(p.length).toBeLessThanOrEqual(128);
			expect(p).toMatch(/^[A-Za-z0-9]+$/);
		}
	});

	it('signs the user out everywhere', async () => {
		const { auth, db, admin, lin, linRow, requestOf } = await twoAccounts();
		await signIn(auth, 'lin@example.com', password); // a second session, on another device
		expect(await sessionOf(auth, lin.cookie)).not.toBeNull();
		expect(await db.session.count({ where: { userId: linRow.id } })).toBe(2);

		await resetPassword(auth, { ...(await requestOf(admin.cookie)), userId: linRow.id });

		expect(await db.session.count({ where: { userId: linRow.id } })).toBe(0);
		expect(await sessionOf(auth, lin.cookie)).toBeNull();
	});

	it('requires the user to set a new password, and leaves every other Account alone', async () => {
		const { auth, db, admin, linRow, requestOf } = await twoAccounts();

		await resetPassword(auth, { ...(await requestOf(admin.cookie)), userId: linRow.id });

		const rows = await db.user.findMany({ select: { email: true, mustChangePassword: true } });
		expect(Object.fromEntries(rows.map((r) => [r.email, r.mustChangePassword]))).toEqual({
			'ada@example.com': false,
			'lin@example.com': true
		});
		// The admin keeps their session.
		expect(await sessionOf(auth, admin.cookie)).not.toBeNull();
	});

	it('refuses a learner before anything is touched', async () => {
		const { auth, db, lin, linRow, requestOf } = await twoAccounts();
		const setUserPassword = vi.spyOn(auth.api, 'setUserPassword');

		await expect(
			resetPassword(auth, { ...(await requestOf(lin.cookie)), userId: linRow.id })
		).rejects.toBeInstanceOf(NotAdminError);

		expect(setUserPassword).not.toHaveBeenCalled();
		expect(await db.session.count({ where: { userId: linRow.id } })).toBe(1);
		await signIn(auth, 'lin@example.com', password);
	});

	it('refuses an admin session the plugin no longer knows', async () => {
		const { auth, db, admin, linRow, requestOf } = await twoAccounts();
		const request = await requestOf(admin.cookie);
		await db.session.deleteMany({ where: { userId: { not: linRow.id } } });

		await expect(resetPassword(auth, { ...request, userId: linRow.id })).rejects.toBeInstanceOf(
			NotAdminError
		);
		await signIn(auth, 'lin@example.com', password);
		expect((await db.user.findUniqueOrThrow({ where: { id: linRow.id } })).mustChangePassword).toBe(
			false
		);
	});

	it('refuses an unknown user id, and an id that is not text', async () => {
		const { auth, admin, requestOf } = await twoAccounts();
		const request = await requestOf(admin.cookie);

		await expect(resetPassword(auth, { ...request, userId: 'nobody' })).rejects.toBeInstanceOf(
			UnknownAccountError
		);
		await expect(resetPassword(auth, { ...request, userId: '' })).rejects.toBeInstanceOf(
			UnknownAccountError
		);
	});

	it('refuses to reset the asking admin own password', async () => {
		const { auth, db, admin, requestOf } = await twoAccounts();
		const ada = await db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });

		await expect(
			resetPassword(auth, { ...(await requestOf(admin.cookie)), userId: ada.id })
		).rejects.toBeInstanceOf(SelfResetError);

		await signIn(auth, 'ada@example.com', password);
		expect(await sessionOf(auth, admin.cookie)).not.toBeNull();
	});

	it('does not hand out a password when a step fails', async () => {
		const { auth, admin, linRow, requestOf } = await twoAccounts();
		vi.spyOn(auth.api, 'revokeUserSessions').mockRejectedValueOnce(new Error('disk'));

		await expect(
			resetPassword(auth, { ...(await requestOf(admin.cookie)), userId: linRow.id })
		).rejects.toThrow('disk');
	});
});
