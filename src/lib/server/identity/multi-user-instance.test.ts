import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { loadCatalogue } from '../content/catalogue.ts';
import { createInstance } from '../instance.ts';
import { createLearningCore } from '../learning/core.ts';
import { createCatalogueScriptedRunner } from '../runner/scripted-catalogue.ts';
import { createFileTestDb } from '../test-db.ts';
import { enabledProviders } from './auth.ts';
import { INVITE_COOKIE } from './invites.ts';
import { createMultiUserInstance } from './multi-user-instance.ts';
import { createFirstAdmin } from './setup.ts';
import type { ProviderStarts } from './throttle.ts';

const made = vi.hoisted(() => ({
	starts: [] as ProviderStarts[],
	auth: [] as unknown[],
	accounts: [] as unknown[]
}));
vi.mock('./throttle.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./throttle.ts')>();
	return {
		...actual,
		createProviderStarts: (...args: Parameters<typeof actual.createProviderStarts>) => {
			const starts = actual.createProviderStarts(...args);
			made.starts.push(starts);
			return starts;
		}
	};
});
vi.mock('./auth.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./auth.ts')>();
	return {
		...actual,
		createAuth: (options: Parameters<typeof actual.createAuth>[0]) => {
			made.auth.push(options.providerStarts);
			return actual.createAuth(options);
		}
	};
});
vi.mock('./account-actions.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./account-actions.ts')>();
	return {
		...actual,
		createAccountActions: (options: Parameters<typeof actual.createAccountActions>[0]) => {
			made.accounts.push(options.providerStarts);
			return actual.createAccountActions(options);
		}
	};
});

const secret = 'a-test-secret-of-at-least-thirty-two-characters';
const origin = 'http://localhost:4174';
const admin = { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' };

async function boot(extra: { origin?: string; providerEnv?: Record<string, string> } = {}) {
	const db = await createFileTestDb();
	const instance = await createInstance(db);
	const built = await createMultiUserInstance({
		db,
		instance,
		secret,
		origin: extra.origin ?? origin,
		providerEnv: extra.providerEnv ?? {}
	});
	return { db, instance, ...built };
}
type Booted = Awaited<ReturnType<typeof boot>>;

/** Restarts the server on the same database: a new Instance read from the rows, a new factory. */
async function restart({ db }: Booted) {
	const instance = await createInstance(db);
	return {
		instance,
		...(await createMultiUserInstance({ db, instance, secret, origin, providerEnv: {} }))
	};
}

const chooseAdmin = async ({ db, instance, multiUser }: Booted) => {
	const { headers } = await createFirstAdmin({ instance, auth: multiUser.auth, db }, admin);
	return headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');
};

const whoIs = (resolver: Booted['resolver'], cookie: string) =>
	resolver.resolve({
		cookies: { get: () => undefined },
		request: { headers: new Headers({ cookie }) }
	});

describe('createMultiUserInstance', () => {
	it('signs the first admin in through the resolver, and Invite links carry the validated origin', async () => {
		const booted = await boot();
		const cookie = await chooseAdmin(booted);

		const who = await whoIs(booted.resolver, cookie);

		expect(booted.instance.mode()).toBe('multi');
		expect(who).toMatchObject({ displayName: 'Ada', role: 'admin', learnerId: 'local' });
		const made = await booted.multiUser.invites.create({ who: who as never, now: new Date() });
		expect(made?.link).toBe(`http://localhost:4174/invite/${made?.token}`);
		expect(await booted.db.learner.findMany()).toEqual([expect.objectContaining({ id: 'local' })]);
	});

	it('wires the Learner remover to this database, for removing an Account', async () => {
		const { db, multiUser } = await boot();
		await db.learner.create({ data: { id: 'gone' } });
		await db.chapterRead.create({ data: { learnerId: 'gone', chapterId: 'c' } });

		await multiUser.deleteLearner('gone');

		expect(await db.learner.count({ where: { id: 'gone' } })).toBe(0);
		expect(await db.chapterRead.count({ where: { learnerId: 'gone' } })).toBe(0);
	});

	it('lets an Invite create exactly one learner Account through the wired auth, and refuses a second use', async () => {
		const booted = await boot();
		const cookie = await chooseAdmin(booted);
		const who = await whoIs(booted.resolver, cookie);
		const made = await booted.multiUser.invites.create({ who: who as never, now: new Date() });
		const signUp = async (email: string) => {
			try {
				await booted.multiUser.auth.api.signUpEmail({
					body: { name: 'Lin', email, password: 'a long enough secret' },
					headers: new Headers({ cookie: `${INVITE_COOKIE}=${made?.token}` })
				});
				return 200;
			} catch (error) {
				return (error as { statusCode?: number }).statusCode;
			}
		};

		expect(await signUp('lin@example.com')).toBe(200);
		expect(await signUp('lin2@example.com')).toBe(403);

		expect(await booted.db.user.findMany({ where: { role: 'learner' } })).toHaveLength(1);
		expect(await booted.multiUser.invites.lookup(made?.token ?? '', new Date())).toBeNull();
	});

	it('derives the cookies from the origin: http keeps them for a plain http browser', async () => {
		const booted = await boot({ origin: 'http://192.168.1.20:3000' });

		const { headers } = await createFirstAdmin(
			{ instance: booted.instance, auth: booted.multiUser.auth, db: booted.db },
			admin
		);

		const [cookie] = headers.getSetCookie();
		expect(cookie).toMatch(/^better-auth\.session_token=/);
		expect(cookie).not.toMatch(/secure/i);
	});

	it('gives an https origin Secure cookies', async () => {
		const booted = await boot({ origin: 'https://learn.example.com' });

		const { headers } = await createFirstAdmin(
			{ instance: booted.instance, auth: booted.multiUser.auth, db: booted.db },
			admin
		);

		expect(headers.getSetCookie()[0]).toMatch(/^__Secure-better-auth\.session_token=.*; Secure/i);
	});

	it('offers a provider only when the factory is given both of its variables', async () => {
		const providers = async (providerEnv: Record<string, string>) =>
			enabledProviders((await boot({ providerEnv })).multiUser.auth);

		expect(await providers({})).toEqual([]);
		expect(await providers({ GITHUB_CLIENT_ID: 'id' })).toEqual([]);
		expect(await providers({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 's' })).toEqual([
			'github'
		]);
	});

	it('gives every Instance its own provider starts, shared by Better Auth and the account actions', async () => {
		made.starts.length = made.auth.length = made.accounts.length = 0;
		const github = { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 's' };
		const first = await boot({ providerEnv: github });
		await boot({ providerEnv: github });
		const [one, two] = made.starts;

		await first.multiUser.accounts.startProvider({
			provider: 'github',
			next: '/',
			address: '1.1.1.1'
		});

		expect(made.starts).toHaveLength(2);
		expect(one?.size()).toBe(1);
		expect(two?.size()).toBe(0);
		// A refund through the object Better Auth's callback hook was given reaches the start the account
		// actions recorded: both were handed the one object of this Instance.
		expect(made.auth[0]).toBe(one);
		expect(made.accounts[0]).toBe(one);
		expect(made.auth[1]).toBe(two);
		expect(made.accounts[1]).toBe(two);
		expect(made.auth[0]).not.toBe(made.auth[1]);
	});
});

describe('the startup repair of Accounts and Learners', () => {
	/** A Multi-user database with its first admin (Learner 'local'), shut down as if the server stopped. */
	async function multiDatabase() {
		const first = await boot();
		await chooseAdmin(first);
		return first;
	}
	const drift = async (db: Booted['db']) => {
		await db.user.create({
			data: { id: 'u2', name: 'Lin', email: 'lin@example.com', learnerId: 'no-row' }
		});
		await db.learner.create({ data: { id: 'orphan' } });
		await db.chapterRead.create({ data: { learnerId: 'orphan', chapterId: 'c' } });
	};
	const learnerIds = async (db: Booted['db']) =>
		(await db.learner.findMany({ orderBy: { id: 'asc' } })).map((l) => l.id);
	const silenced = () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		onTestFinished(() => warn.mockRestore());
		return warn;
	};

	it('on a restart in Multi-user mode creates the missing Learner, removes the orphan with its progress, and keeps the admin Learner', async () => {
		const first = await multiDatabase();
		await drift(first.db);
		const warn = silenced();

		await restart(first);

		expect(await learnerIds(first.db)).toEqual(['local', 'no-row']);
		expect(await first.db.chapterRead.count()).toBe(0);
		// The created Learner is writable now.
		const catalogue = await loadCatalogue('src/lib/server/content/fixture');
		const core = createLearningCore({
			catalogue,
			db: first.db,
			runner: createCatalogueScriptedRunner(catalogue)
		});
		await core.forLearner('no-row').reachChapterEnd('stacks-undo-log');
		const said = warn.mock.calls.flat().join('\n');
		expect(said).toContain('1 missing Learner(s) created, 1 orphan Learner(s) removed');
		expect(said).not.toMatch(/no-row|orphan\b(?!\s+Learner)|lin@|u2/);
	});

	it('on a restart removes a session that can never resolve, and keeps a valid one and an OAuth-only one', async () => {
		const first = await multiDatabase();
		const { db } = first;
		const adminUser = await db.user.findFirstOrThrow();
		const generation = (
			await db.account.findFirstOrThrow({
				where: { userId: adminUser.id, providerId: 'credential' }
			})
		).credentialGeneration;
		await db.learner.create({ data: { id: 'oauth-learner' } });
		await db.user.create({
			data: { id: 'oauth', name: 'Oz', email: 'oz@example.com', learnerId: 'oauth-learner' }
		});
		const session = (id: string, userId: string, credentialGeneration: string) =>
			db.session.create({
				data: {
					id,
					token: `t-${id}`,
					userId,
					expiresAt: new Date(Date.now() + 1e9),
					credentialGeneration
				}
			});
		await session('valid', adminUser.id, generation);
		await session('inert', adminUser.id, 'an-older-generation');
		await session('oauth-only', 'oauth', '');
		const warn = silenced();
		const before = await db.session.count({ where: { id: 'inert' } });

		await restart(first);

		expect(before).toBe(1);
		const left = (await db.session.findMany()).map((r) => r.id);
		expect(left).toContain('valid');
		expect(left).toContain('oauth-only');
		expect(left).not.toContain('inert');
		const said = warn.mock.calls.flat().join('\n');
		expect(said).toContain('1 unusable session(s) removed');
		expect(said).not.toMatch(/t-inert|an-older-generation/);
	});

	it('does not run in Local mode: the Local Learner stays and so does an unreferenced one', async () => {
		const db = await createFileTestDb();
		const instance = await createInstance(db);
		await instance.chooseLocal();
		await db.learner.create({ data: { id: 'local' } });
		await db.learner.create({ data: { id: 'other' } });

		await createMultiUserInstance({ db, instance, secret, origin, providerEnv: {} });

		expect(await learnerIds(db)).toEqual(['local', 'other']);
	});

	it('does not run on an Instance that is not set up', async () => {
		const db = await createFileTestDb();
		await db.learner.create({ data: { id: 'other' } });

		await createMultiUserInstance({
			db,
			instance: await createInstance(db),
			secret,
			origin,
			providerEnv: {}
		});

		expect(await learnerIds(db)).toEqual(['other']);
	});
});
