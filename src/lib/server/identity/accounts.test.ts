import { describe, expect, it, vi } from 'vitest';
import { createFileTestDb } from '../test-db.ts';
import { type AccountRow, listAccounts, NotAdminError } from './accounts.ts';
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
