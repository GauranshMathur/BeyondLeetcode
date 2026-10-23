import { describe, expect, it, vi } from 'vitest';
import { createFileTestDb } from '../test-db.ts';
import {
	type AccountRow,
	listAccounts,
	NotAdminError,
	resetAdminPassword,
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

	return { db, auth, resolver, signUp, requestOf };
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

	describe('when a step fails', () => {
		// The property: once the password has changed, no session from before the reset survives, and no
		// outcome leaves a session alive with the flag unset. No password is returned from any failure.
		async function failing(step: 'flag' | 'password' | 'revoke') {
			const s = await twoAccounts();
			await signIn(s.auth, 'lin@example.com', password); // a second session
			const { internalAdapter } = await s.auth.$context;
			if (step === 'flag')
				vi.spyOn(internalAdapter, 'updateUser').mockRejectedValueOnce(new Error('disk'));
			if (step === 'password')
				vi.spyOn(s.auth.api, 'setUserPassword').mockRejectedValueOnce(new Error('disk'));
			if (step === 'revoke')
				vi.spyOn(internalAdapter, 'deleteUserSessions').mockRejectedValueOnce(new Error('disk'));
			const outcome = await resetPassword(s.auth, {
				...(await s.requestOf(s.admin.cookie)),
				userId: s.linRow.id
			}).then(
				() => 'returned',
				(error) => (error as Error).message
			);
			const stored = await s.db.user.findUniqueOrThrow({ where: { id: s.linRow.id } });
			const sessions = await s.db.session.count({ where: { userId: s.linRow.id } });
			const oldPasswordWorks = await signIn(s.auth, 'lin@example.com', password).then(
				() => true,
				() => false
			);
			return { outcome, flag: stored.mustChangePassword, sessions, oldPasswordWorks };
		}

		it('flag fails: nothing changed, the old password and sessions are intact, nothing is shown', async () => {
			expect(await failing('flag')).toEqual({
				outcome: 'disk',
				flag: false,
				sessions: 2, // both untouched
				oldPasswordWorks: true
			});
		});

		it('password fails: sessions are still ended and the flag is set, the old password remains', async () => {
			expect(await failing('password')).toEqual({
				outcome: 'disk',
				flag: true,
				sessions: 0,
				oldPasswordWorks: true
			});
		});

		it('revoke fails after the password changed: the error is thrown, the flag is set, the old password is dead', async () => {
			expect(await failing('revoke')).toEqual({
				outcome: 'disk',
				flag: true,
				sessions: 2, // not revoked: the flag confines them to the password page
				oldPasswordWorks: false
			});
		});

		it('revokes the old sessions when the password step fails after changing it', async () => {
			const { auth, db, admin, linRow, requestOf } = await twoAccounts();
			const real = auth.api.setUserPassword;
			vi.spyOn(auth.api, 'setUserPassword').mockImplementationOnce(async (...args) => {
				await real(...args);
				throw new Error('lost the answer');
			});

			await expect(
				resetPassword(auth, { ...(await requestOf(admin.cookie)), userId: linRow.id })
			).rejects.toThrow('lost the answer');

			expect(await db.session.count({ where: { userId: linRow.id } })).toBe(0);
			expect(
				(await db.user.findUniqueOrThrow({ where: { id: linRow.id } })).mustChangePassword
			).toBe(true);
		});
	});

	it('deletes the old sessions even if the admin session ends after the password changed', async () => {
		const { auth, db, admin, linRow, requestOf } = await twoAccounts();
		const real = auth.api.setUserPassword;
		vi.spyOn(auth.api, 'setUserPassword').mockImplementationOnce(async (...args) => {
			const answer = await real(...args);
			await db.session.deleteMany({ where: { userId: { not: linRow.id } } }); // the admin signs out
			return answer;
		});

		const { password: fresh } = await resetPassword(auth, {
			...(await requestOf(admin.cookie)),
			userId: linRow.id
		});

		expect(await db.session.count({ where: { userId: linRow.id } })).toBe(0);
		expect(await sessionOf(auth, admin.cookie)).toBeNull();
		await signIn(auth, 'lin@example.com', fresh);
	});

	it.each([
		['is no longer an admin', 'learner'],
		['is a different Account', 'other']
	])('writes nothing when the fresh session user %s', async (_, change) => {
		const { auth, db, admin, linRow, requestOf } = await twoAccounts();
		const request = await requestOf(admin.cookie);
		if (change === 'learner') {
			await db.user.update({ where: { email: 'ada@example.com' }, data: { role: 'learner' } });
		} else {
			await db.learner.create({ data: { id: 'someone-else' } });
			await db.user.update({
				where: { email: 'ada@example.com' },
				data: { learnerId: 'someone-else' }
			});
		}
		const setUserPassword = vi.spyOn(auth.api, 'setUserPassword');

		await expect(resetPassword(auth, { ...request, userId: linRow.id })).rejects.toBeInstanceOf(
			NotAdminError
		);

		expect(setUserPassword).not.toHaveBeenCalled();
		expect((await db.user.findUniqueOrThrow({ where: { id: linRow.id } })).mustChangePassword).toBe(
			false
		);
		expect(await db.session.count({ where: { userId: linRow.id } })).toBe(1);
	});
});

describe('resetAdminPassword', () => {
	const signIn = (auth: Auth, email: string, pw: string) =>
		auth.api.signInEmail({ body: { email, password: pw } });

	async function withAdmin() {
		const s = await setup();
		const admin = await s.signUp('Ada Admin', 'ada@example.com', 'admin');
		const lin = await s.signUp('Lin Learner', 'lin@example.com');
		return { ...s, admin, lin };
	}

	it('returns a password that signs the admin in, and the old one stops working', async () => {
		const { auth } = await withAdmin();

		const result = await resetAdminPassword(auth);

		expect(result?.email).toBe('ada@example.com');
		await expect(signIn(auth, 'ada@example.com', password)).rejects.toThrow();
		const signedIn = await signIn(auth, 'ada@example.com', result?.password ?? '');
		expect(signedIn.user.email).toBe('ada@example.com');
	});

	it('forces a change, ends every admin session, and leaves other Accounts alone', async () => {
		const { auth, db, admin, lin, requestOf } = await withAdmin();
		await signIn(auth, 'ada@example.com', password); // a second session
		expect(await db.session.count()).toBe(3);

		await resetAdminPassword(auth);

		const rows = await db.user.findMany({ select: { email: true, mustChangePassword: true } });
		expect(Object.fromEntries(rows.map((r) => [r.email, r.mustChangePassword]))).toEqual({
			'ada@example.com': true,
			'lin@example.com': false
		});
		await expect(requestOf(admin.cookie)).rejects.toThrow();
		expect(await db.session.count()).toBe(1);
		expect((await requestOf(lin.cookie)).who.role).toBe('learner');
		await signIn(auth, 'lin@example.com', password);
	});

	it('the new session carries the flag the gate redirects on', async () => {
		const { auth, resolver } = await withAdmin();
		const result = await resetAdminPassword(auth);
		const { headers } = await auth.api.signInEmail({
			body: { email: 'ada@example.com', password: result?.password ?? '' },
			returnHeaders: true
		});
		const cookie = headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');

		const who = await resolver.resolve({
			cookies: { get: () => undefined },
			request: { headers: new Headers({ cookie }) }
		});

		expect(who?.mustChangePassword).toBe(true);
	});

	it('makes a different password each time', async () => {
		const { auth } = await withAdmin();
		const a = (await resetAdminPassword(auth))?.password;
		const b = (await resetAdminPassword(auth))?.password;
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Za-z0-9]{20}$/);
	});

	it('returns null and changes nothing when there is no admin Account', async () => {
		const { auth, db, signUp } = await setup();
		await signUp('Lin Learner', 'lin@example.com');

		expect(await resetAdminPassword(auth)).toBeNull();

		await signIn(auth, 'lin@example.com', password);
		expect(await db.session.count()).toBe(2);
		expect((await db.user.findMany()).some((u) => u.mustChangePassword)).toBe(false);
	});

	it('returns null when there are no Accounts at all', async () => {
		const { auth } = await setup();
		expect(await resetAdminPassword(auth)).toBeNull();
	});

	it('does not treat a role that merely contains admin as the admin', async () => {
		const { auth, db } = await setup();
		await db.user.create({
			data: {
				id: 'u1',
				name: 'X',
				email: 'x@example.com',
				emailVerified: false,
				role: 'admin,learner',
				learnerId: 'l1'
			}
		});
		expect(await resetAdminPassword(auth)).toBeNull();
	});

	it('revokes the sessions even when the password step fails, and returns no password', async () => {
		const { auth, db } = await withAdmin();
		const { internalAdapter } = await auth.$context;
		vi.spyOn(internalAdapter, 'updatePassword').mockRejectedValue(new Error('disk'));

		await expect(resetAdminPassword(auth)).rejects.toThrow('disk');

		const ada = await db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
		expect(ada.mustChangePassword).toBe(true);
		expect(await db.session.count({ where: { userId: ada.id } })).toBe(0);
	});

	it('sets the flag before the password changes', async () => {
		const { auth, db } = await withAdmin();
		const { internalAdapter } = await auth.$context;
		const original = internalAdapter.updatePassword;
		let flagWhenPasswordChanged: boolean | undefined;
		vi.spyOn(internalAdapter, 'updatePassword').mockImplementation(async (...args) => {
			flagWhenPasswordChanged = (
				await db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } })
			).mustChangePassword;
			return original(...args);
		});

		await resetAdminPassword(auth);

		expect(flagWhenPasswordChanged).toBe(true);
	});
});
