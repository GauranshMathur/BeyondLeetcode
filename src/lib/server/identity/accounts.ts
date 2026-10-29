import { randomInt } from 'node:crypto';
import { APIError } from 'better-auth/api';
import type { Auth } from './auth.ts';
import type { Identity, Role } from './index.ts';
import { currentSession, passwordAccountWhere, roleOf } from './session-binding.ts';

/** One Account as the Users page draws it. Nothing else of the user row leaves this module. */
export interface AccountRow {
	/** Better Auth's user id: what the row actions (reset password, remove) will name. */
	id: string;
	name: string;
	email: string;
	role: Role;
	/** When the Account was created, an ISO 8601 timestamp. */
	joined: string;
	/** This is the Account asking. */
	you: boolean;
}

/** The asker is not an admin (to Identity, which is the check that counts), or the plugin refused them. */
export class NotAdminError extends Error {
	constructor() {
		super('Only the admin may manage Accounts.');
		this.name = 'NotAdminError';
	}
}

/** The admin plugin returns at most this many users unless asked for more; the list is read in pages. */
const PAGE_SIZE = 100;

/**
 * Every Account, oldest first, for the admin. `who` is what Identity made of this request and
 * `headers` carry its session cookie, which the plugin reads again for its own check.
 *
 * Identity's role is the check that counts: it is `admin` exactly. The plugin's check alone is not
 * enough, because it splits a stored role on commas, so `admin,learner` passes it while the app
 * treats that user as a learner. A learner is refused before anything is read.
 */
export async function listAccounts(
	auth: Auth,
	{ who, headers }: { who: Identity; headers: Headers }
): Promise<AccountRow[]> {
	if (who.role !== 'admin') throw new NotAdminError();

	// By id: a page boundary that moves while Accounts come and go must never show a row twice.
	const rows = new Map<string, AccountRow>();
	let total = Number.POSITIVE_INFINITY;
	for (let offset = 0; rows.size < total; offset += PAGE_SIZE) {
		const page = await readPage(auth, headers, offset);
		// An admin always exists, so no users at all is the plugin's reply to a failed read (it swallows
		// database errors into an empty list), never an empty Instance.
		if (page.users.length === 0 && offset === 0) throw new Error('The Accounts could not be read.');
		if (page.users.length === 0) break;
		for (const user of page.users) {
			rows.set(user.id, {
				id: user.id,
				name: user.name,
				email: user.email,
				// The same rule as the Multi-user adapter: admin exactly, anything else is a learner.
				role: roleOf(user.role),
				joined: new Date(user.createdAt).toISOString(),
				you: (user as { learnerId?: string | null }).learnerId === who.learnerId
			});
		}
		total = page.total;
	}
	return [...rows.values()];
}

async function readPage(auth: Auth, headers: Headers, offset: number) {
	try {
		return await auth.api.listUsers({
			headers,
			query: { limit: PAGE_SIZE, offset, sortBy: 'createdAt', sortDirection: 'asc' }
		});
	} catch (error) {
		// No session, or not an admin to the plugin: the same refusal as Identity's.
		if (error instanceof APIError && (error.statusCode === 401 || error.statusCode === 403)) {
			throw new NotAdminError();
		}
		throw error;
	}
}

/** The Account to reset is not there: a stale row, or an id that was never one. */
export class UnknownAccountError extends Error {
	constructor() {
		super('That Account does not exist.');
		this.name = 'UnknownAccountError';
	}
}

/** The admin asked to reset their own password, which would sign them out and lose the one-time password. */
export class SelfResetError extends Error {
	constructor() {
		super('The admin cannot reset their own password here.');
		this.name = 'SelfResetError';
	}
}

/** The admin asked to remove their own Account, which would end the session that asked. */
export class SelfRemoveError extends Error {
	constructor() {
		super('The admin cannot remove their own Account.');
		this.name = 'SelfRemoveError';
	}
}

/**
 * The Account is gone (it cannot sign in and has no session) but deleting its Learner and progress failed,
 * as a whole: the rows are still there, unreachable, and nothing in the product points at them.
 */
export class ProgressNotRemovedError extends Error {
	constructor() {
		super('The Account was removed but its progress could not be deleted.');
		this.name = 'ProgressNotRemovedError';
	}
}

/** No look-alikes (0/O, 1/l/I), so a password read out or typed from a message survives. */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
/** 20 characters of 57: about 117 bits, within Better Auth's 12 to 128. */
const ONE_TIME_PASSWORD_LENGTH = 20;

function oneTimePassword(): string {
	let out = '';
	for (let i = 0; i < ONE_TIME_PASSWORD_LENGTH; i++) {
		out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
	}
	return out;
}

/**
 * Gives an Account a random one-time password, cleans up every session it has (the credential
 * generation, session-binding.ts, is what stops them resolving) and makes it set a new
 * password before anything else. The password is returned to the caller for the admin to see once;
 * it is stored only as a hash and must not be logged or kept.
 *
 * The plugin's own set-user-password does none of the product steps, so all three run here, through
 * `auth.api` (server-side, no HTTP): the flag, then the password, then the sessions' cleanup, which is
 * attempted whatever the password step did. A database failure or a kill after the password changed can
 * leave an old row, which cannot resolve (session-binding.ts) and carries the flag, so the gate confines it
 * to the password page, and no outcome leaves one alive with the flag unset. A failure part-way throws and no password
 * is returned: the admin tries again, and a retry redoes every step.
 *
 * Identity's role is the check that counts, as in `listAccounts`, and it is made before anything is read.
 */
export async function resetPassword(
	auth: Auth,
	{ who, headers, userId }: { who: Identity; headers: Headers; userId: string }
): Promise<{ password: string }> {
	if (who.role !== 'admin') throw new NotAdminError();
	if (typeof userId !== 'string' || userId === '') throw new UnknownAccountError();

	const { internalAdapter } = await auth.$context;
	const target = await internalAdapter.findUserById(userId);
	if (!target) throw new UnknownAccountError();
	if ((target as { learnerId?: string | null }).learnerId === who.learnerId) {
		throw new SelfResetError();
	}

	const password = oneTimePassword();
	try {
		// The plugin's admin check is the password step's, which now comes after the flag. Ask for the
		// session first, so a session that ended a moment ago, or whose user is no longer the admin who
		// asked (role changed, or a different Account), changes nothing at all.
		const fresh = await currentSession(auth, headers);
		if (fresh?.identity.role !== 'admin' || fresh.identity.learnerId !== who.learnerId) {
			throw new NotAdminError();
		}
		// Before the password, so the password never changes while the flag is unset.
		await internalAdapter.updateUser(userId, { mustChangePassword: true });
		try {
			await auth.api.setUserPassword({ headers, body: { userId, newPassword: password } });
		} finally {
			// Cleanup, attempted whatever the password step did (it may have changed the password and lost its
			// answer). The guarantee is the credential generation (session-binding.ts): a session from before
			// the password write cannot resolve. A session that outlives a failed cleanup (or a kill) also
			// carries the flag, set before the password, so the gate confines it to the password page. Through the adapter,
			// not the plugin: the admin check has passed, and cleanup must not fail because the admin's own
			// session ended in between. A database failure still throws.
			await internalAdapter.deleteUserSessions(userId);
		}
	} catch (error) {
		if (error instanceof APIError && (error.statusCode === 401 || error.statusCode === 403)) {
			throw new NotAdminError();
		}
		throw error;
	}
	return { password };
}

/**
 * The server command's reset (`reset-admin-password`): gives the admin Account a one-time password,
 * ends its sessions and makes it set a new password. The proof of ownership is shell access to the
 * server, so there is no session to check; a caller must never reach this from a request.
 *
 * Returns null, having changed nothing, when no Account is an admin (role exactly `admin`, as everywhere
 * else). If several are, the oldest is reset. Same order as `resetPassword`: the flag, then the password
 * (hashed by Better Auth's own hasher, so sign-in accepts it), then the sessions in a `finally`, so no
 * outcome leaves a session from before the reset alive with the flag unset. The cleanup is attempted, and the
 * guarantee is session-binding.ts: a database failure or a kill after the password change can leave old sessions alive, flagged
 * and so confined by the gate to the password page, as in `resetPassword`. A failure throws and no
 * password is returned: run the command again. The password is not logged or kept.
 */
export async function resetAdminPassword(
	auth: Auth
): Promise<{ email: string; password: string } | null> {
	const context = await auth.$context;
	const { internalAdapter } = context;
	const admins = await context.adapter.findMany<{ id: string; email: string }>({
		model: 'user',
		where: [{ field: 'role', value: 'admin' }],
		sortBy: { field: 'createdAt', direction: 'asc' },
		limit: 1
	});
	const target = admins[0];
	if (!target) return null;

	const password = oneTimePassword();
	const hashed = await context.password.hash(password);
	await internalAdapter.updateUser(target.id, { mustChangePassword: true });
	try {
		if (await internalAdapter.findCredentialAccount(target.id)) {
			await internalAdapter.updatePassword(target.id, hashed);
		} else {
			await internalAdapter.createAccount({
				...passwordAccountWhere(target.id),
				password: hashed
			});
		}
	} finally {
		// Cleanup, attempted whatever the password step did. The guarantee is the credential generation
		// (session-binding.ts): a session from before the password write cannot resolve. If this delete fails
		// (a database error) or the process is killed, the row can survive, and it carries the flag, set before
		// the password, so the gate confines it to the password page.
		await internalAdapter.deleteUserSessions(target.id);
	}
	return { email: target.email, password };
}

/**
 * Removes an Account and everything of its Learner: the user (through `auth.api.removeUser`, which ends
 * the user's sessions, deletes its credentials and then the user row), and then `deleteLearner` (the
 * progress module's, handed in), which deletes the progress and the Learner row in one transaction. The bare plugin endpoint would leave the
 * Learner and all its progress behind, and is off over HTTP.
 *
 * Why this order. The user goes first, so a failure never deletes a Learner's rows and leaves the user
 * who owns them. Whatever fails, nobody is left with a session next to a deleted user: the plugin ends
 * the sessions before it touches the user, and the user row's delete cascades to any it missed. If the
 * user step fails the progress is untouched and a retry redoes every step. If the Learner step fails
 * (`ProgressNotRemovedError`) the Account is already gone and cannot sign in, the progress is whole
 * (one transaction) but unreachable, and the Learner id is random and never reused; the admin is told.
 * An Account whose Learner row is missing (a sign-up that died between the user insert and the Learner
 * create) is removed the same way: deleting rows that are not there is not an error, and the email is free.
 *
 * Identity's role is the check that counts, as in `resetPassword`, and it is made before anything is
 * read. The asking admin is never removed (found by Learner, as for `you` on the Users page).
 */
export async function removeAccount(
	auth: Auth,
	{
		deleteLearner,
		who,
		headers,
		userId
	}: {
		/** `deleteLearner` of the progress module, bound to the database: the Learner and all its progress. */
		deleteLearner: (learnerId: string) => Promise<void>;
		who: Identity;
		headers: Headers;
		userId: string;
	}
): Promise<void> {
	if (who.role !== 'admin') throw new NotAdminError();
	if (typeof userId !== 'string' || userId === '') throw new UnknownAccountError();

	const { internalAdapter } = await auth.$context;
	const target = await internalAdapter.findUserById(userId);
	if (!target) throw new UnknownAccountError();
	const learnerId = (target as { learnerId?: string | null }).learnerId;
	if (learnerId === who.learnerId) throw new SelfRemoveError();

	try {
		// The plugin's admin check is the removal's own; ask for the session first so a session that ended a
		// moment ago, or whose user is no longer the admin who asked, changes nothing at all.
		const fresh = await currentSession(auth, headers);
		if (fresh?.identity.role !== 'admin' || fresh.identity.learnerId !== who.learnerId) {
			throw new NotAdminError();
		}
		await auth.api.removeUser({ headers, body: { userId } });
	} catch (error) {
		if (error instanceof APIError) {
			if (error.statusCode === 401 || error.statusCode === 403) throw new NotAdminError();
			// Removed by another request between the look-up and here.
			if (error.statusCode === 404) throw new UnknownAccountError();
		}
		throw error;
	}

	if (!learnerId) return;
	try {
		await deleteLearner(learnerId);
	} catch {
		throw new ProgressNotRemovedError();
	}
}
