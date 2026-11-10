import { describe, expect, it, vi } from 'vitest';
import { deleteLearner } from '../learning/progress.ts';
import {
	type AccountRow,
	createAdminActions,
	isAdminRefusal,
	listAccounts,
	NotAdminError,
	removeAccount,
	resetAdminPassword,
	resetPassword,
	SelfRemoveError,
	SelfResetError,
	UnknownAccountError
} from './accounts.ts';
import type { Auth } from './auth.ts';
import { createTestInstance } from './test-auth.ts';

const password = 'correct horse battery staple';

async function setup() {
	const { auth, db, resolver, multiUser, admin, learner, githubOnly } = await createTestInstance();

	/** Makes an Account (the Instance's first admin when asked) and returns the session cookie header it got. */
	async function signUp(name: string, email: string, role?: 'admin') {
		const { cookie } = await (role ? admin : learner)({ name, email, password });
		return { cookie };
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

	return { db, auth, resolver, multiUser, signUp, requestOf, githubOnly };
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

	it('gives an Account that signs in only with GitHub a working password, and its forced change clears the flag', async () => {
		// Pins an internal branch of Better Auth 1.7.7 (setUserPassword creates a missing credential row,
		// plugins/admin/routes.mjs), which resetPassword relies on: there is no code of ours for it.
		const { auth, db, admin, requestOf, githubOnly, multiUser } = await twoAccounts();
		const oz = await githubOnly({ name: 'Oz', email: 'oz@example.com' });
		expect(await db.account.count({ where: { userId: oz.id, providerId: 'credential' } })).toBe(0);

		const { password: fresh } = await resetPassword(auth, {
			...(await requestOf(admin.cookie)),
			userId: oz.id
		});

		expect(await db.account.count({ where: { userId: oz.id, providerId: 'credential' } })).toBe(1);
		expect(await db.account.count({ where: { userId: oz.id, providerId: 'github' } })).toBe(1);
		const signedIn = await auth.api.signInEmail({
			body: { email: 'oz@example.com', password: fresh },
			returnHeaders: true
		});
		expect(signedIn.response.user.email).toBe('oz@example.com');
		expect((await db.user.findUniqueOrThrow({ where: { id: oz.id } })).mustChangePassword).toBe(
			true
		);

		// The reset revoked the GitHub session; the new password's session carries the flag, then the forced change.
		const cookie = signedIn.headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.join('; ');
		const changed = await multiUser.accounts.changePassword({
			headers: new Headers({ cookie }),
			current: fresh,
			next: 'a brand new passphrase 42',
			confirm: 'a brand new passphrase 42',
			address: '10.0.0.1'
		});
		expect(changed).toMatchObject({ forced: true, flagCleared: true });

		expect((await db.user.findUniqueOrThrow({ where: { id: oz.id } })).mustChangePassword).toBe(
			false
		);
		await expect(signIn(auth, 'oz@example.com', 'a brand new passphrase 42')).resolves.toBeTruthy();
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

describe('removeAccount', () => {
	const remover = (db: Awaited<ReturnType<typeof setup>>['db']) => (id: string) =>
		deleteLearner(db, id);
	async function threeAccounts() {
		const s = await setup();
		const admin = await s.signUp('Ada Admin', 'ada@example.com', 'admin');
		const lin = await s.signUp('Lin Learner', 'lin@example.com');
		const max = await s.signUp('Max Learner', 'max@example.com');
		const linRow = await s.db.user.findUniqueOrThrow({ where: { email: 'lin@example.com' } });
		const maxRow = await s.db.user.findUniqueOrThrow({ where: { email: 'max@example.com' } });
		return { ...s, admin, lin, max, linRow, maxRow };
	}
	const signIn = (auth: Auth, email: string, pw: string) =>
		auth.api.signInEmail({ body: { email, password: pw } });
	const sessionOf = (auth: Auth, cookie: string) =>
		auth.api.getSession({ headers: new Headers({ cookie }) });

	/** A row in every progress table for a Learner. */
	async function progressFor(db: Awaited<ReturnType<typeof setup>>['db'], learnerId: string) {
		await db.chapterRead.create({ data: { learnerId, chapterId: 'c' } });
		await db.buildStep.create({
			data: { learnerId, topicId: 't', language: 'python', problemId: 'p', files: {} }
		});
		await db.topicLanguage.create({ data: { learnerId, topicId: 't', language: 'python' } });
		await db.hintsRevealed.create({ data: { learnerId, problemId: 'p', count: 1 } });
		await db.submission.create({
			data: {
				learnerId,
				problemId: 'p',
				topicId: 't',
				language: 'python',
				files: {},
				verdict: 'Accepted'
			}
		});
	}
	async function rowsOf(db: Awaited<ReturnType<typeof setup>>['db'], learnerId: string) {
		const where = { learnerId };
		return [
			await db.chapterRead.count({ where }),
			await db.buildStep.count({ where }),
			await db.topicLanguage.count({ where }),
			await db.hintsRevealed.count({ where }),
			await db.submission.count({ where }),
			await db.learner.count({ where: { id: learnerId } })
		];
	}

	it('removes the Account: it cannot sign in, its session is dead, and no row of it is left', async () => {
		const { auth, db, admin, lin, linRow, requestOf } = await threeAccounts();
		await signIn(auth, 'lin@example.com', password); // a second session

		await removeAccount(auth, {
			deleteLearner: remover(db),
			...(await requestOf(admin.cookie)),
			userId: linRow.id
		});

		await expect(signIn(auth, 'lin@example.com', password)).rejects.toBeTruthy();
		expect(await sessionOf(auth, lin.cookie)).toBeNull();
		expect(await db.user.count({ where: { id: linRow.id } })).toBe(0);
		expect(await db.session.count({ where: { userId: linRow.id } })).toBe(0);
		expect(await db.account.count({ where: { userId: linRow.id } })).toBe(0);
		// The admin keeps their session, and the email is free again.
		expect(await sessionOf(auth, admin.cookie)).not.toBeNull();
	});

	it('frees the email for a new sign-up', async () => {
		const { auth, db, admin, linRow, requestOf, signUp } = await threeAccounts();
		await removeAccount(auth, {
			deleteLearner: remover(db),
			...(await requestOf(admin.cookie)),
			userId: linRow.id
		});

		await expect(signUp('Lin Again', 'lin@example.com')).resolves.toBeTruthy();
	});

	it('deletes the Learner and all its progress, and changes no other Learner', async () => {
		const { auth, db, admin, linRow, maxRow, requestOf } = await threeAccounts();
		await progressFor(db, linRow.learnerId);
		await progressFor(db, maxRow.learnerId);
		expect(await rowsOf(db, linRow.learnerId)).toEqual([1, 1, 1, 1, 1, 1]);
		const maxBefore = await rowsOf(db, maxRow.learnerId);

		await removeAccount(auth, {
			deleteLearner: remover(db),
			...(await requestOf(admin.cookie)),
			userId: linRow.id
		});

		expect(await rowsOf(db, linRow.learnerId)).toEqual([0, 0, 0, 0, 0, 0]);
		expect(await rowsOf(db, maxRow.learnerId)).toEqual(maxBefore);
		expect(await db.user.count({ where: { id: maxRow.id } })).toBe(1);
		await signIn(auth, 'max@example.com', password);
	});

	it('removes an Account whose Learner row is missing, and frees its email', async () => {
		const { auth, db, admin, linRow, requestOf, signUp } = await threeAccounts();
		// A sign-up that died between the User insert and the Learner create.
		await db.learner.delete({ where: { id: linRow.learnerId } });

		await removeAccount(auth, {
			deleteLearner: remover(db),
			...(await requestOf(admin.cookie)),
			userId: linRow.id
		});

		expect(await db.user.count({ where: { id: linRow.id } })).toBe(0);
		await expect(signIn(auth, 'lin@example.com', password)).rejects.toBeTruthy();
		await expect(signUp('Lin Again', 'lin@example.com')).resolves.toBeTruthy();
	});

	it('refuses a learner before anything is touched', async () => {
		const { auth, db, lin, max, linRow, maxRow, requestOf } = await threeAccounts();
		await progressFor(db, maxRow.learnerId);
		const removeUser = vi.spyOn(auth.api, 'removeUser');

		await expect(
			removeAccount(auth, {
				deleteLearner: remover(db),
				...(await requestOf(lin.cookie)),
				userId: maxRow.id
			})
		).rejects.toBeInstanceOf(NotAdminError);

		expect(removeUser).not.toHaveBeenCalled();
		expect(await rowsOf(db, maxRow.learnerId)).toEqual([1, 1, 1, 1, 1, 1]);
		expect(await sessionOf(auth, max.cookie)).not.toBeNull();
		expect(await db.user.count({ where: { id: linRow.id } })).toBe(1);
	});

	it('refuses an admin session the plugin no longer knows', async () => {
		const { auth, db, admin, linRow, requestOf } = await threeAccounts();
		const request = await requestOf(admin.cookie);
		await db.session.deleteMany({ where: { userId: { not: linRow.id } } });

		await expect(
			removeAccount(auth, { deleteLearner: remover(db), ...request, userId: linRow.id })
		).rejects.toBeInstanceOf(NotAdminError);

		expect(await db.user.count({ where: { id: linRow.id } })).toBe(1);
		await signIn(auth, 'lin@example.com', password);
	});

	it('refuses an unknown user id, and an id that is not text', async () => {
		const { auth, db, admin, requestOf } = await threeAccounts();
		const request = await requestOf(admin.cookie);

		await expect(
			removeAccount(auth, { deleteLearner: remover(db), ...request, userId: 'nobody' })
		).rejects.toBeInstanceOf(UnknownAccountError);
		await expect(
			removeAccount(auth, { deleteLearner: remover(db), ...request, userId: '' })
		).rejects.toBeInstanceOf(UnknownAccountError);
		await expect(
			removeAccount(auth, {
				deleteLearner: remover(db),
				...request,
				userId: 7 as unknown as string
			})
		).rejects.toBeInstanceOf(UnknownAccountError);
	});

	it('never removes the asking admin: the Account, its progress and its session stay', async () => {
		const { auth, db, admin, requestOf } = await threeAccounts();
		const ada = await db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
		await progressFor(db, ada.learnerId);

		await expect(
			removeAccount(auth, {
				deleteLearner: remover(db),
				...(await requestOf(admin.cookie)),
				userId: ada.id
			})
		).rejects.toBeInstanceOf(SelfRemoveError);

		expect(await rowsOf(db, ada.learnerId)).toEqual([1, 1, 1, 1, 1, 1]);
		expect(await sessionOf(auth, admin.cookie)).not.toBeNull();
		await signIn(auth, 'ada@example.com', password);
	});

	it.each([
		['is no longer an admin', 'learner'],
		['is a different Account', 'other']
	])('removes nothing when the fresh session user %s', async (_, change) => {
		const { auth, db, admin, linRow, requestOf } = await threeAccounts();
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
		const removeUser = vi.spyOn(auth.api, 'removeUser');

		await expect(
			removeAccount(auth, { deleteLearner: remover(db), ...request, userId: linRow.id })
		).rejects.toBeInstanceOf(NotAdminError);

		expect(removeUser).not.toHaveBeenCalled();
		expect(await db.user.count({ where: { id: linRow.id } })).toBe(1);
	});

	describe('when a step fails', () => {
		// The order is: the user (the plugin ends its sessions, deletes its credentials, then the user), then
		// the Learner and its progress. A failure of the first leaves the progress untouched; a failure of the
		// second leaves no Account and no session. No outcome deletes a Learner's rows and leaves the user.
		async function failing(step: 'sessions' | 'user' | 'learner') {
			const s = await threeAccounts();
			await progressFor(s.db, s.linRow.learnerId);
			await signIn(s.auth, 'lin@example.com', password); // a second session
			const { internalAdapter } = await s.auth.$context;
			if (step === 'sessions')
				vi.spyOn(internalAdapter, 'deleteUserSessions').mockRejectedValueOnce(new Error('disk'));
			if (step === 'user')
				vi.spyOn(internalAdapter, 'deleteUser').mockRejectedValueOnce(new Error('disk'));
			if (step === 'learner') {
				await s.db.$executeRawUnsafe(
					"CREATE TRIGGER no_learner_delete BEFORE DELETE ON Learner BEGIN SELECT RAISE(ABORT, 'disk'); END"
				);
			}
			const outcome = await removeAccount(s.auth, {
				deleteLearner: remover(s.db),
				...(await s.requestOf(s.admin.cookie)),
				userId: s.linRow.id
			}).then(
				() => 'returned',
				(error) => (error as Error).name
			);
			return {
				outcome,
				user: await s.db.user.count({ where: { id: s.linRow.id } }),
				sessions: await s.db.session.count({ where: { userId: s.linRow.id } }),
				progress: await rowsOf(s.db, s.linRow.learnerId),
				otherProgress: await rowsOf(s.db, s.maxRow.learnerId)
			};
		}

		it('ending the sessions fails: nothing changed', async () => {
			expect(await failing('sessions')).toEqual({
				outcome: 'Error',
				user: 1,
				sessions: 2,
				progress: [1, 1, 1, 1, 1, 1],
				otherProgress: [0, 0, 0, 0, 0, 1]
			});
		});

		it('removing the user fails: the sessions are gone, the progress is kept, the user can try again', async () => {
			const result = await failing('user');
			expect(result).toEqual({
				outcome: 'Error',
				user: 1,
				sessions: 0,
				progress: [1, 1, 1, 1, 1, 1],
				otherProgress: [0, 0, 0, 0, 0, 1]
			});
		});

		it('deleting the Learner fails: the Account is gone and cannot sign in, and the failure is named', async () => {
			const result = await failing('learner');
			expect(result).toEqual({
				outcome: 'ProgressNotRemovedError',
				user: 0,
				sessions: 0,
				progress: [1, 1, 1, 1, 1, 1], // one transaction: all of it is left, none half-deleted
				otherProgress: [0, 0, 0, 0, 0, 1]
			});
		});

		it('a failed removal can be tried again', async () => {
			const { auth, db, admin, linRow, requestOf } = await threeAccounts();
			await progressFor(db, linRow.learnerId);
			const { internalAdapter } = await auth.$context;
			vi.spyOn(internalAdapter, 'deleteUser').mockRejectedValueOnce(new Error('disk'));
			const request = await requestOf(admin.cookie);

			await expect(
				removeAccount(auth, { deleteLearner: remover(db), ...request, userId: linRow.id })
			).rejects.toThrow('disk');
			await removeAccount(auth, { deleteLearner: remover(db), ...request, userId: linRow.id });

			expect(await rowsOf(db, linRow.learnerId)).toEqual([0, 0, 0, 0, 0, 0]);
			expect(await db.user.count({ where: { id: linRow.id } })).toBe(0);
		});
	});

	it('reads, resets and removes through auth.api with every /admin path off over HTTP', async () => {
		const { auth, db, admin, linRow, requestOf } = await threeAccounts();
		const request = await requestOf(admin.cookie);
		for (const path of ['list-users', 'set-user-password', 'revoke-user-sessions', 'remove-user']) {
			const res = await auth.handler(
				new Request(`http://localhost:3000/api/auth/admin/${path}`, { method: 'POST' })
			);
			expect(res.status, path).toBe(404);
		}

		expect((await listAccounts(auth, request)).length).toBe(3);
		await resetPassword(auth, { ...request, userId: linRow.id });
		await removeAccount(auth, { deleteLearner: remover(db), ...request, userId: linRow.id });
		expect((await listAccounts(auth, request)).length).toBe(2);
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

	it('writes nothing else when the flag write fails: the password and sessions are untouched', async () => {
		const { auth, db } = await withAdmin();
		const { internalAdapter } = await auth.$context;
		vi.spyOn(internalAdapter, 'updateUser').mockRejectedValue(new Error('disk'));

		await expect(resetAdminPassword(auth)).rejects.toThrow('disk');

		await signIn(auth, 'ada@example.com', password);
		const ada = await db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
		expect(ada.mustChangePassword).toBe(false);
	});

	it('when the session deletion fails after the password changed, the old session is no longer accepted and the error is thrown', async () => {
		const { auth, db, admin, resolver } = await withAdmin();
		const { internalAdapter } = await auth.$context;
		vi.spyOn(internalAdapter, 'deleteUserSessions').mockRejectedValue(new Error('disk'));

		await expect(resetAdminPassword(auth)).rejects.toThrow('disk');

		const ada = await db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
		expect(ada.mustChangePassword).toBe(true);
		await expect(signIn(auth, 'ada@example.com', password)).rejects.toThrow();
		const who = await resolver.resolve({
			cookies: { get: () => undefined },
			request: { headers: new Headers({ cookie: admin.cookie }) }
		});
		// The row survived the failed deletion, but it began before the password was set (C53): it is over.
		expect(who).toBeNull();
	});
});

describe('the admin actions', () => {
	/** A Multi-user Instance with its admin, a learner and the admin actions the server would use. */
	async function world() {
		const t = await createTestInstance();
		const admin = await t.admin({ name: 'Ada Admin', email: 'ada@example.com', password });
		const lin = await t.learner({ name: 'Lin Learner', email: 'lin@example.com', password });
		const identityOf = async (cookie: string) => {
			const headers = new Headers({ cookie });
			const who = await t.resolver.resolve({
				cookies: { get: () => undefined },
				request: { headers }
			});
			if (!who) throw new Error('the cookie resolves to nobody');
			return { who, headers };
		};
		return {
			...t,
			actions: t.multiUser.adminActions,
			admin: { ...admin, ...(await identityOf(admin.cookie)) },
			lin: { ...lin, ...(await identityOf(lin.cookie)) }
		};
	}

	it('lists the Accounts for the admin, as the Users page draws them', async () => {
		const { actions, admin } = await world();

		const rows = await actions.listAccounts(admin);

		expect(isAdminRefusal(rows)).toBe(false);
		expect((rows as AccountRow[]).map((r) => [r.email, r.role, r.you])).toEqual([
			['ada@example.com', 'admin', true],
			['lin@example.com', 'learner', false]
		]);
	});

	it('refuses every action to a learner with NOT_ADMIN, before anything is read or changed', async () => {
		const { actions, auth, db, instance, lin } = await world();
		const adminRow = await db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
		const before = {
			users: await db.user.count(),
			invites: await db.invite.count(),
			registration: instance.registrationMode()
		};

		const answers = [
			await actions.listAccounts(lin),
			await actions.resetPassword({ ...lin, userId: adminRow.id }),
			await actions.removeAccount({ ...lin, userId: adminRow.id }),
			await actions.createInvite({ who: lin.who, now: new Date() }),
			await actions.pendingInvites({ who: lin.who, now: new Date() }),
			await actions.cancelInvite({ who: lin.who, id: 'any' }),
			await actions.setRegistrationMode({ who: lin.who, mode: 'open' })
		];

		expect(answers).toEqual(answers.map(() => ({ refused: 'NOT_ADMIN' })));
		expect({
			users: await db.user.count(),
			invites: await db.invite.count(),
			registration: instance.registrationMode()
		}).toEqual(before);
		// Nothing was reset: the admin still signs in with the old password.
		await expect(
			auth.api.signInEmail({ body: { email: 'ada@example.com', password } })
		).resolves.toBeTruthy();
	});

	it('refuses a role that only contains admin, which the plugin alone would let through', async () => {
		const { actions, db, admin } = await world();
		await db.user.update({ where: { email: 'ada@example.com' }, data: { role: 'admin,learner' } });
		const who = { ...admin.who, role: 'learner' as const };

		expect(await actions.listAccounts({ ...admin, who })).toEqual({ refused: 'NOT_ADMIN' });
	});

	it('refuses with NOT_ADMIN when the admin session ended after Identity judged it', async () => {
		const { actions, auth, db, admin } = await world();
		const linRow = await db.user.findUniqueOrThrow({ where: { email: 'lin@example.com' } });
		await auth.api.signOut({ headers: admin.headers });

		expect(await actions.resetPassword({ ...admin, userId: linRow.id })).toEqual({
			refused: 'NOT_ADMIN'
		});
		expect(await actions.removeAccount({ ...admin, userId: linRow.id })).toEqual({
			refused: 'NOT_ADMIN'
		});
		expect(await db.user.count()).toBe(2);
	});

	it('resets a password to a one-time password that signs in, and ends the sessions', async () => {
		const { actions, auth, db, admin, lin } = await world();
		const linRow = await db.user.findUniqueOrThrow({ where: { email: 'lin@example.com' } });

		const answer = await actions.resetPassword({ ...admin, userId: linRow.id });

		if (isAdminRefusal(answer)) throw new Error(`refused ${answer.refused}`);
		expect(answer.password).toMatch(/^[A-Za-z0-9]{20}$/);
		await expect(
			auth.api.signInEmail({ body: { email: 'lin@example.com', password } })
		).rejects.toThrow();
		await expect(
			auth.api.signInEmail({ body: { email: 'lin@example.com', password: answer.password } })
		).resolves.toBeTruthy();
		expect(await auth.api.getSession({ headers: lin.headers })).toBeNull();
	});

	it('answers UNKNOWN_ACCOUNT for an id that is not an Account, SELF_RESET and SELF_REMOVE for the admin', async () => {
		const { actions, db, admin } = await world();
		const adminRow = await db.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });

		expect(await actions.resetPassword({ ...admin, userId: 'nobody' })).toEqual({
			refused: 'UNKNOWN_ACCOUNT'
		});
		expect(await actions.removeAccount({ ...admin, userId: '' })).toEqual({
			refused: 'UNKNOWN_ACCOUNT'
		});
		expect(await actions.resetPassword({ ...admin, userId: adminRow.id })).toEqual({
			refused: 'SELF_RESET'
		});
		expect(await actions.removeAccount({ ...admin, userId: adminRow.id })).toEqual({
			refused: 'SELF_REMOVE'
		});
		expect(await db.user.count()).toBe(2);
	});

	it('removes an Account, then its Learner with the progress', async () => {
		const { actions, auth, db, admin } = await world();
		const linRow = await db.user.findUniqueOrThrow({ where: { email: 'lin@example.com' } });
		await db.chapterRead.create({
			data: { learnerId: linRow.learnerId as string, chapterId: 'c' }
		});

		expect(await actions.removeAccount({ ...admin, userId: linRow.id })).toEqual({ removed: true });

		expect(await db.user.count({ where: { email: 'lin@example.com' } })).toBe(0);
		expect(await db.learner.count({ where: { id: linRow.learnerId as string } })).toBe(0);
		expect(await db.chapterRead.count({ where: { learnerId: linRow.learnerId as string } })).toBe(
			0
		);
		await expect(
			auth.api.signInEmail({ body: { email: 'lin@example.com', password } })
		).rejects.toThrow();
	});

	it('answers PROGRESS_NOT_REMOVED when the Account went but its progress did not', async () => {
		const { auth, db, instance, multiUser, admin } = await world();
		const failing = createAdminActions({
			auth,
			invites: multiUser.invites,
			instance,
			deleteLearner: async () => {
				throw new Error('disk');
			}
		});
		const linRow = await db.user.findUniqueOrThrow({ where: { email: 'lin@example.com' } });

		expect(await failing.removeAccount({ ...admin, userId: linRow.id })).toEqual({
			refused: 'PROGRESS_NOT_REMOVED'
		});
		expect(await db.user.count({ where: { email: 'lin@example.com' } })).toBe(0);
		expect(await db.learner.count({ where: { id: linRow.learnerId as string } })).toBe(1);
	});

	it('throws a failure that is not a refusal, rather than call it one', async () => {
		const { actions, auth, db, admin } = await world();
		const linRow = await db.user.findUniqueOrThrow({ where: { email: 'lin@example.com' } });
		vi.spyOn(auth.api, 'removeUser').mockRejectedValue(new Error('disk'));

		await expect(actions.removeAccount({ ...admin, userId: linRow.id })).rejects.toThrow('disk');
	});

	it('creates, lists and cancels Invites for the admin', async () => {
		const { actions, admin } = await world();
		const now = new Date();

		const made = await actions.createInvite({ who: admin.who, now });
		if (isAdminRefusal(made)) throw new Error(`refused ${made.refused}`);
		expect(made.link).toContain(`/invite/${made.token}`);
		const pending = await actions.pendingInvites({ who: admin.who, now });
		expect(pending).toEqual([expect.objectContaining({ id: made.id })]);
		expect(await actions.cancelInvite({ who: admin.who, id: made.id })).toEqual({
			cancelled: true
		});
		expect(await actions.cancelInvite({ who: admin.who, id: made.id })).toEqual({
			cancelled: false
		});
		expect(await actions.pendingInvites({ who: admin.who, now })).toEqual([]);
	});

	it('switches the Registration Mode for the next sign-up, and answers REGISTRATION_UNAVAILABLE on a Local Instance', async () => {
		const { actions, instance, admin } = await world();
		expect(instance.registrationMode()).toBe('invite');

		expect(await actions.setRegistrationMode({ who: admin.who, mode: 'open' })).toEqual({
			registration: 'open'
		});
		expect(instance.registrationMode()).toBe('open');

		const local = await createTestInstance();
		await local.chooseLocal();
		expect(
			await local.multiUser.adminActions.setRegistrationMode({ who: admin.who, mode: 'open' })
		).toEqual({ refused: 'REGISTRATION_UNAVAILABLE' });
	});
});
