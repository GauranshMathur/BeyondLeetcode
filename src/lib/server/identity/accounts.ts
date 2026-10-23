import { randomInt } from 'node:crypto';
import { APIError } from 'better-auth/api';
import type { Auth } from './auth.ts';
import type { Identity, Role } from './index.ts';

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
				role: user.role === 'admin' ? 'admin' : 'learner',
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
 * Gives an Account a random one-time password, ends every session it has and makes it set a new
 * password before anything else. The password is returned to the caller for the admin to see once;
 * it is stored only as a hash and must not be logged or kept.
 *
 * The plugin's own set-user-password does none of the product steps, so all three run here, through
 * `auth.api` (server-side, no HTTP): the flag, then the password, then the sessions, which are deleted
 * whatever the password step did. So once the password has changed no earlier session survives, and
 * no outcome leaves a session alive with the flag unset. A failure part-way throws and no password
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
		const fresh = await auth.api.getSession({ headers });
		const freshUser = fresh?.user as
			| { role?: string | null; learnerId?: string | null }
			| undefined;
		if (freshUser?.role !== 'admin' || freshUser.learnerId !== who.learnerId) {
			throw new NotAdminError();
		}
		// Before the password, so the password never changes while the flag is unset.
		await internalAdapter.updateUser(userId, { mustChangePassword: true });
		try {
			await auth.api.setUserPassword({ headers, body: { userId, newPassword: password } });
		} finally {
			// Attempted whatever the password step did (it may have changed the password and lost its answer):
			// once the password has changed no earlier session survives, and a session that outlives a failed
			// revocation carries the flag, so the gate confines it to the password page. Through the adapter,
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
 * outcome leaves a session from before the reset alive with the flag unset. A failure throws and no
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
				userId: target.id,
				providerId: 'credential',
				accountId: target.id,
				password: hashed
			});
		}
	} finally {
		// Whatever the password step did: once it has changed no earlier session survives, and one that
		// outlives a failure carries the flag, so the gate confines it to the password page.
		await internalAdapter.deleteUserSessions(target.id);
	}
	return { email: target.email, password };
}
