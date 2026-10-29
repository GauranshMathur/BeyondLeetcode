import { describe, expect, it } from 'vitest';
import { createTestAuth, TEST_SECRET } from '../identity/test-auth.ts';
import { createInstance } from '../instance.ts';
import {
	EXIT_FAILED,
	EXIT_NO_ADMIN,
	EXIT_OK,
	EXIT_USAGE,
	runResetAdminPassword,
	USAGE
} from './reset-admin-password.ts';

const password = 'correct horse battery staple';
const env = { DATABASE_URL: 'file:unused', BETTER_AUTH_SECRET: TEST_SECRET };

async function setup(roles: Array<'admin' | undefined>) {
	let role: 'admin' | undefined;
	// The command hashes with the production hasher and the tests sign in with that password.
	const { auth, db } = await createTestAuth({
		hasher: 'production',
		admit: () => (role ? { role } : {})
	});
	let n = 0;
	for (const r of roles) {
		role = r;
		await auth.api.signUpEmail({
			body: { name: `User ${n}`, email: `u${n}@example.com`, password }
		});
		n++;
	}
	return { db, auth, open: () => db };
}

describe('reset-admin-password command', () => {
	it('prints a password on stdout that signs the admin in, and says what happens next on stderr', async () => {
		const { auth, db, open } = await setup(['admin', undefined]);

		const result = await runResetAdminPassword([], env, open);

		expect(result.code).toBe(EXIT_OK);
		const printed = result.stdout.trim();
		expect(printed).toMatch(/^[A-Za-z0-9]{20}$/);
		expect(result.stderr).not.toContain(printed);
		expect(result.stderr).toContain('u0@example.com');
		const signedIn = await auth.api.signInEmail({
			body: { email: 'u0@example.com', password: printed }
		});
		expect(signedIn.user.email).toBe('u0@example.com');
		expect(
			(await db.user.findUniqueOrThrow({ where: { email: 'u0@example.com' } })).mustChangePassword
		).toBe(true);
	});

	it('says there is no admin Account and changes nothing when the Accounts have none', async () => {
		const { auth, db, open } = await setup([undefined]);

		const result = await runResetAdminPassword([], env, open);

		expect(result.code).toBe(EXIT_NO_ADMIN);
		expect(result.stdout).toBe('');
		expect(result.stderr).toMatch(/no admin Account/i);
		await auth.api.signInEmail({ body: { email: 'u0@example.com', password } });
		expect((await db.user.findMany()).some((u) => u.mustChangePassword)).toBe(false);
	});

	it('says so, and exits the same way, when there are no Accounts at all', async () => {
		const { open } = await setup([]);
		const result = await runResetAdminPassword([], env, open);
		expect(result.code).toBe(EXIT_NO_ADMIN);
		expect(result.stdout).toBe('');
		expect(result.stderr).toMatch(/no admin Account/i);
	});

	it('reopens Setup on a multi Instance with no Accounts: clears the mode and tells the owner to restart', async () => {
		const { db, open } = await setup([]);
		await (await createInstance(db)).chooseMulti();

		const result = await runResetAdminPassword([], env, open);

		expect(result.code).toBe(EXIT_OK);
		expect(result.stdout).toBe('');
		expect(result.stderr).toMatch(/restart/i);
		expect(result.stderr).toMatch(/Setup/);
		expect((await createInstance(db)).mode()).toBeNull();
	});

	it('restores multi when an admin Account exists with no stored mode, then resets as usual and says to restart', async () => {
		const { auth, db, open } = await setup(['admin']);
		expect((await createInstance(db)).mode()).toBeNull();

		const result = await runResetAdminPassword([], env, open);

		expect(result.code).toBe(EXIT_OK);
		expect((await createInstance(db)).mode()).toBe('multi');
		const printed = result.stdout.trim();
		expect(printed).toMatch(/^[A-Za-z0-9]{20}$/);
		expect(result.stderr).toMatch(/restart/i);
		expect(result.stderr).not.toContain(printed);
		await auth.api.signInEmail({ body: { email: 'u0@example.com', password: printed } });
		expect(
			(await db.user.findUniqueOrThrow({ where: { email: 'u0@example.com' } })).mustChangePassword
		).toBe(true);
	});

	it('still asks for the restart when the mode was restored but the reset then failed', async () => {
		const { db } = await setup(['admin']);
		const broken = new Proxy(db, {
			get(target, prop, receiver) {
				if (prop === 'account') throw new Error('disk full');
				return Reflect.get(target, prop, receiver);
			}
		});

		const result = await runResetAdminPassword([], env, () => broken);

		expect(result.code).toBe(EXIT_FAILED);
		expect(result.stdout).toBe('');
		expect((await createInstance(db)).mode()).toBe('multi');
		expect(result.stderr).toMatch(/restart/i);
	});

	it('tells the owner to run it again when no mode is stored after the reset', async () => {
		const { db } = await setup(['admin']);
		const noRestore = new Proxy(db, {
			get(target, prop, receiver) {
				// The restore finds a row to be there (a Setup mid-claim) and does nothing.
				if (prop === '$executeRaw') return async () => 0;
				return Reflect.get(target, prop, receiver);
			}
		});

		const result = await runResetAdminPassword([], env, () => noRestore);

		expect(result.code).toBe(EXIT_OK);
		expect(result.stdout.trim()).toMatch(/^[A-Za-z0-9]{20}$/);
		expect(result.stderr).toMatch(/no stored mode/i);
		expect(result.stderr).toMatch(/again/i);
	});

	it('does not ask for a restart when the mode was already stored', async () => {
		const { db, open } = await setup(['admin']);
		await (await createInstance(db)).chooseMulti();

		const result = await runResetAdminPassword([], env, open);

		expect(result.code).toBe(EXIT_OK);
		expect(result.stderr).not.toMatch(/restart/i);
	});

	it('leaves the mode alone when there are Accounts but no admin', async () => {
		const { db, open } = await setup([undefined]);
		await (await createInstance(db)).chooseMulti();

		const result = await runResetAdminPassword([], env, open);

		expect(result.code).toBe(EXIT_NO_ADMIN);
		expect((await createInstance(db)).mode()).toBe('multi');
	});

	it('leaves a Local Instance with no Accounts alone and says there is no admin', async () => {
		const { db, open } = await setup([]);
		await (await createInstance(db)).chooseLocal();

		const result = await runResetAdminPassword([], env, open);

		expect(result.code).toBe(EXIT_NO_ADMIN);
		expect((await createInstance(db)).mode()).toBe('local');
	});

	it('fails plainly, without opening the database, when BETTER_AUTH_SECRET is missing or unusable', async () => {
		for (const bad of [undefined, '', 'short', 'change-me-change-me-change-me-change-me']) {
			const result = await runResetAdminPassword(
				[],
				{ DATABASE_URL: 'file:unused', BETTER_AUTH_SECRET: bad },
				() => {
					throw new Error('db-was-opened');
				}
			);
			expect(result.code).toBe(EXIT_USAGE);
			expect(result.stdout).toBe('');
			expect(result.stderr).toContain('BETTER_AUTH_SECRET');
			expect(result.stderr).not.toContain('db-was-opened');
		}
	});

	it('fails plainly when DATABASE_URL is missing', async () => {
		const result = await runResetAdminPassword([], { BETTER_AUTH_SECRET: TEST_SECRET }, () => {
			throw new Error('db-was-opened');
		});
		expect(result.code).toBe(EXIT_USAGE);
		expect(result.stderr).toContain('DATABASE_URL');
	});

	it('refuses arguments and shows the usage', async () => {
		const result = await runResetAdminPassword(['--force'], env, () => {
			throw new Error('db-was-opened');
		});
		expect(result.code).toBe(EXIT_USAGE);
		expect(result.stderr).toContain(USAGE);
	});

	it('reports a failed reset without printing a password', async () => {
		const { db } = await setup(['admin']);
		const broken = new Proxy(db, {
			get(target, prop, receiver) {
				if (prop === '$transaction' || prop === 'account') throw new Error('disk full');
				return Reflect.get(target, prop, receiver);
			}
		});
		const result = await runResetAdminPassword([], env, () => broken);
		expect(result.code).toBe(EXIT_FAILED);
		expect(result.stdout).toBe('');
		expect(result.stderr).toMatch(/run the command again/i);
	});

	it('usage names what it needs', () => {
		expect(USAGE).toContain('BETTER_AUTH_SECRET');
		expect(USAGE).toContain('DATABASE_URL');
	});
});
