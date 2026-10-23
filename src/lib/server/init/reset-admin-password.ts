import { createDb, type Db } from '../db.ts';
import { resetAdminPassword } from '../identity/accounts.ts';
import { createAuth, isPlaceholderSecret, MIN_SECRET_LENGTH } from '../identity/auth.ts';
import { clearEmptyMultiInstance, restoreMultiInstance } from '../instance.ts';

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
If an admin Account exists but the Instance has no stored mode, the command restores Multi-user first
and asks you to restart web.
With no Accounts at all on a Multi-user Instance there is no admin to reset: the command clears the stored mode
instead, prints nothing on stdout, and asks you to restart web and open Setup.
Exit codes: 0 done (or Setup reopened), 1 no admin Account (nothing changed), 2 bad usage or settings, 3 failed part-way (run it again).`;

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

/** ORIGIN as an http(s) origin, or '' when it is unset or not a URL (a bare `http://` is not one). */
export function parseOrigin(value: string | undefined): string {
	try {
		const url = new URL(value ?? '');
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : '';
	} catch {
		return '';
	}
}

export async function runResetAdminPassword(
	args: string[],
	env: { DATABASE_URL?: string; BETTER_AUTH_SECRET?: string; ORIGIN?: string },
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

	let db: Db;
	let auth: ReturnType<typeof createAuth>;
	try {
		// ORIGIN is optional: nothing here makes a cookie or checks a request origin. It is passed along
		// only to keep Better Auth from warning that it has no base URL.
		db = open(env.DATABASE_URL);
		auth = createAuth({ db, origin: parseOrigin(env.ORIGIN), secret });
	} catch {
		return fail(EXIT_FAILED, 'could not open the database. Nothing was changed.');
	}

	let restored = false;
	try {
		// An admin Account with no stored mode (a clear that landed during Setup, C54): store multi again
		// first, so a failed reset below still leaves the Instance usable. Narrow and atomic, see instance.ts.
		restored = await restoreMultiInstance(db);
		const reset = await resetAdminPassword(auth);
		if (!reset) {
			// No admin. With no Account at all on a multi Instance (a crash between the mode claim and the first
			// sign-up) Setup is closed and nothing else can open it: clear the stored mode. Refused, and
			// nothing changed, unless the Accounts are really empty (one atomic statement, see instance.ts).
			if (await clearEmptyMultiInstance(db)) {
				return {
					code: EXIT_OK,
					stdout: '',
					stderr: `This Instance was set up as Multi-user but has no Accounts, so there was no admin to reset. Its stored mode is cleared and Setup will open again.\nRestart the web container now (docker compose restart web) and open Setup straight away: the running server still has the old mode in memory, and the first visitor to Setup becomes the admin, as on a new Instance.\n`
				};
			}
			return fail(
				EXIT_NO_ADMIN,
				'there is no admin Account on this Instance, so nothing was changed.'
			);
		}
		return {
			code: EXIT_OK,
			stdout: `${reset.password}\n`,
			stderr: `Reset the password of the admin ${reset.email}. The one-time password is on stdout above; it is shown once. Sign in with it and choose a new password. Every earlier session was signed out.\n${
				restored
					? 'This Instance had lost its stored mode and is Multi-user again. Restart the web container now (docker compose restart web): the running server still has the old mode in memory.\n'
					: ''
			}`
		};
	} catch {
		// The error is not printed: it could carry a query or a path, and the output may be logged.
		return fail(
			EXIT_FAILED,
			`the reset did not finish and no password was printed. Run the command again.${
				restored
					? ' The Instance did get its Multi-user mode back, so restart the web container too (docker compose restart web).'
					: ''
			}`
		);
	}
}

/** Resolves once the stream has taken the text, so `process.exit` cannot cut a pipe short. */
const write = (stream: NodeJS.WriteStream, text: string) =>
	new Promise<void>((resolve, reject) =>
		stream.write(text, (error) => (error ? reject(error) : resolve()))
	);

if (import.meta.main) {
	const result = await runResetAdminPassword(process.argv.slice(2), process.env);
	let code = result.code;
	try {
		if (result.stdout) await write(process.stdout, result.stdout);
		if (result.stderr) await write(process.stderr, result.stderr);
	} catch {
		// The password could not be delivered (a closed pipe): it was changed and is now lost. Nothing is
		// written, since a message could go to the same broken output; the exit code tells the owner to
		// run the command again.
		code = EXIT_FAILED;
	}
	process.exit(code);
}
