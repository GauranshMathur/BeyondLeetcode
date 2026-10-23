import { createDb, type Db } from '../db.ts';
import { resetAdminPassword } from '../identity/accounts.ts';
import { createAuth, isPlaceholderSecret, MIN_SECRET_LENGTH } from '../identity/auth.ts';

/**
 * `reset-admin-password` role (ADR 0004): the way back for an admin who forgot their password. It needs
 * a shell on the server, which is the proof of ownership, so it asks nothing else. It prints the
 * one-time password once, on stdout only; everything else goes to stderr.
 */

export const EXIT_OK = 0;
/** No Account is an admin (including no Accounts at all). Nothing was changed. */
export const EXIT_NO_ADMIN = 1;
/** Wrong arguments or missing settings. Nothing was opened or changed. */
export const EXIT_USAGE = 2;
/** The reset started and did not finish. No password was printed; run it again. */
export const EXIT_FAILED = 3;

export const USAGE = `Usage: docker compose exec web docker-entrypoint.sh reset-admin-password

Sets a new one-time password on the admin Account, signs it out everywhere and prints the password once.
Sign in with it; you are then asked to choose a new password. Takes no options.

Needs, in the container's environment (compose.yaml passes them from .env):
  DATABASE_URL         the Instance's database (set in the image).
  BETTER_AUTH_SECRET   the secret your Instance already uses (48 random hex characters).
Exit codes: 0 done, 1 no admin Account (nothing changed), 2 bad usage or settings, 3 failed part-way (run it again).`;

export interface CommandResult {
	code: number;
	/** Only ever the password and a newline, or nothing. */
	stdout: string;
	stderr: string;
}

const fail = (code: number, message: string): CommandResult => ({
	code,
	stdout: '',
	stderr: `reset-admin-password: ${message}\n`
});

export async function runResetAdminPassword(
	args: string[],
	env: { DATABASE_URL?: string; BETTER_AUTH_SECRET?: string },
	open: (url: string) => Db = createDb
): Promise<CommandResult> {
	if (args.length > 0) return fail(EXIT_USAGE, `unexpected argument.\n\n${USAGE}`);
	if (!env.DATABASE_URL) return fail(EXIT_USAGE, `DATABASE_URL is not set.\n\n${USAGE}`);
	const secret = env.BETTER_AUTH_SECRET ?? '';
	if (secret === '') {
		return fail(EXIT_USAGE, `BETTER_AUTH_SECRET is not set. Use the one in your .env.\n\n${USAGE}`);
	}

	if (secret.length < MIN_SECRET_LENGTH || isPlaceholderSecret(secret)) {
		return fail(
			EXIT_USAGE,
			`BETTER_AUTH_SECRET is unusable (shorter than ${MIN_SECRET_LENGTH} characters, or a placeholder). Use the one in your .env.\n\n${USAGE}`
		);
	}

	let auth: ReturnType<typeof createAuth>;
	try {
		// ORIGIN is not needed: nothing here makes a cookie or checks a request origin.
		auth = createAuth({ db: open(env.DATABASE_URL), origin: '', secret });
	} catch {
		return fail(EXIT_FAILED, 'could not open the database. Nothing was changed.');
	}

	try {
		const reset = await resetAdminPassword(auth);
		if (!reset) {
			return fail(
				EXIT_NO_ADMIN,
				'there is no admin Account on this Instance, so nothing was changed.'
			);
		}
		return {
			code: EXIT_OK,
			stdout: `${reset.password}\n`,
			stderr: `Reset the password of the admin ${reset.email}. The one-time password is on stdout above; it is shown once. Sign in with it and choose a new password. Every earlier session was signed out.\n`
		};
	} catch {
		// The error is not printed: it could carry a query or a path, and the output may be logged.
		return fail(
			EXIT_FAILED,
			'the reset did not finish and no password was printed. Run the command again.'
		);
	}
}

if (import.meta.main) {
	const result = await runResetAdminPassword(process.argv.slice(2), process.env);
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	process.exit(result.code);
}
