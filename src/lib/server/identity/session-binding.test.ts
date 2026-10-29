import { createHmac } from 'node:crypto';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { resetAdminPassword, resetPassword } from './accounts.ts';
import type { Admission } from './auth.ts';
import {
	currentSession,
	emailKey,
	PASSWORD_PROVIDER_ID,
	passwordAccountWhere,
	roleOf,
	sweepStaleSessions
} from './session-binding.ts';
import { createTestAuth, TEST_SECRET } from './test-auth.ts';

const headersOf = (cookie: string) => new Headers({ cookie });

describe('currentSession', () => {
	it('names the Account, its Learner and the flags', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { id, cookie } = await signUp();
		const user = await db.user.findFirstOrThrow();

		expect(await currentSession(auth, headersOf(cookie))).toEqual({
			userId: id,
			identity: { learnerId: user.learnerId, displayName: 'Ada', role: 'learner' },
			mustChangePassword: false,
			refreshedCookies: []
		});
	});

	it('is null with no cookie or a forged one', async () => {
		const { auth } = await createTestAuth();
		expect(await currentSession(auth, new Headers())).toBeNull();
		expect(
			await currentSession(auth, headersOf('better-auth.session_token=forged.sig'))
		).toBeNull();
	});

	it('reports the must-change flag and an admin', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { cookie } = await signUp();
		await db.user.updateMany({ data: { mustChangePassword: true, role: 'admin' } });

		const s = await currentSession(auth, headersOf(cookie));
		expect(s?.mustChangePassword).toBe(true);
		expect(s?.identity.role).toBe('admin');
	});

	it('is null for a stale credential generation, and drops the session', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { id, cookie } = await signUp();
		await db.account.updateMany({
			where: passwordAccountWhere(id),
			data: { credentialGeneration: 'rotated' }
		});

		expect(await currentSession(auth, headersOf(cookie))).toBeNull();
		expect(await db.session.count()).toBe(0);
	});

	it('is null for a banned user', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { cookie } = await signUp();
		await db.user.updateMany({ data: { banned: true } });
		expect(await currentSession(auth, headersOf(cookie))).toBeNull();
	});

	it('is null for an Account without a Learner', async () => {
		const { auth, db, signUp } = await createTestAuth();
		const { cookie } = await signUp();
		await db.user.updateMany({ data: { learnerId: '' } });
		expect(await currentSession(auth, headersOf(cookie))).toBeNull();
	});
});

describe('the helpers', () => {
	it('roleOf is admin exactly', () => {
		expect(roleOf('admin')).toBe('admin');
		for (const stored of ['admin,learner', 'Admin', 'learner', '', null, undefined]) {
			expect(roleOf(stored)).toBe('learner');
		}
	});

	it('emailKey lowercases and does not trim', () => {
		expect(emailKey('Ada@Example.COM')).toBe('ada@example.com');
		expect(emailKey(' a@b.c ')).toBe(' a@b.c ');
	});

	it('names the password Account', () => {
		expect(PASSWORD_PROVIDER_ID).toBe('credential');
		expect(passwordAccountWhere('u1')).toEqual({
			userId: 'u1',
			providerId: 'credential',
			accountId: 'u1'
		});
	});

	it('matches the password Account Better Auth wrote', async () => {
		const { db, signUp } = await createTestAuth();
		const { id } = await signUp();
		expect(await db.account.count({ where: passwordAccountWhere(id) })).toBe(1);
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
