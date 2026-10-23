import { describe, expect, it } from 'vitest';
import { createAuth } from '../identity/auth.ts';
import { createFileTestDb } from '../test-db.ts';
import {
	EXIT_FAILED,
	EXIT_NO_ADMIN,
	EXIT_OK,
	EXIT_USAGE,
	runResetAdminPassword,
	USAGE
} from './reset-admin-password.ts';

const secret = 'test-secret-test-secret-test-secret-0123';
const password = 'correct horse battery staple';
const env = { DATABASE_URL: 'file:unused', BETTER_AUTH_SECRET: secret };

async function setup(roles: Array<'admin' | undefined>) {
	const db = await createFileTestDb();
	let role: 'admin' | undefined;
	const auth = createAuth({
		db,
		origin: '',
		secret,
		admitSignUp: () => (role ? { role } : {})
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

	it('fails plainly, without opening the database, when BETTER_AUTH_SECRET is missing or unusable', async () => {
		for (const bad of [undefined, '', 'short', 'change-me-change-me-change-me-change-me']) {
			const result = await runResetAdminPassword(
				[],
				{ DATABASE_URL: 'file:unused', BETTER_AUTH_SECRET: bad },
				() => {
					throw new Error('opened');
				}
			);
			expect(result.code).toBe(EXIT_USAGE);
			expect(result.stdout).toBe('');
			expect(result.stderr).toContain('BETTER_AUTH_SECRET');
			expect(result.stderr).not.toContain('opened');
		}
	});

	it('fails plainly when DATABASE_URL is missing', async () => {
		const result = await runResetAdminPassword([], { BETTER_AUTH_SECRET: secret }, () => {
			throw new Error('opened');
		});
		expect(result.code).toBe(EXIT_USAGE);
		expect(result.stderr).toContain('DATABASE_URL');
	});

	it('refuses arguments and shows the usage', async () => {
		const result = await runResetAdminPassword(['--force'], env, () => {
			throw new Error('opened');
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
