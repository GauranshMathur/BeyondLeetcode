import { randomUUID as createId } from 'node:crypto';
import { APIError, isAPIError } from 'better-auth/api';
import type { Db } from '../db.ts';
import type { Auth } from './auth.ts';

/*
 * The credential generation is the guarantee: a session resolves only under the generation it was created
 * under, so a session made across a password write never resolves, whatever else happens. Deleting sessions
 * after a password write (accounts.ts, the reset command) is cleanup of rows that already cannot resolve.
 */

/** Better Auth's password Account: providerId `credential`, accountId the user id. */
export const PASSWORD_PROVIDER_ID = 'credential';

/** The `where` that finds a user's password Account. */
export function passwordAccountWhere(userId: string) {
	return { userId, providerId: PASSWORD_PROVIDER_ID, accountId: userId };
}

/** A stored role as the app sees it: `admin` exactly, anything else a learner. */
export function roleOf(stored: string | null | undefined): 'admin' | 'learner' {
	return stored === 'admin' ? 'admin' : 'learner';
}

/** An email as Better Auth looks it up: lowercased, not trimmed. */
export function emailKey(email: string): string {
	return email.toLowerCase();
}

export type CurrentSession = {
	userId: string;
	identity: { learnerId: string; displayName: string; role: 'admin' | 'learner' };
	mustChangePassword: boolean;
	/** Set-Cookie headers of an extended session, to send back. */
	refreshedCookies: string[];
};

/**
 * The session these headers name, with every session rule applied: Better Auth's /get-session hook
 * drops a session whose credential generation is stale; no session, a banned user or an Account
 * without a Learner is null. The session is read from the database on every call.
 */
export async function currentSession(auth: Auth, headers: Headers): Promise<CurrentSession | null> {
	// `returnHeaders`: an active session is extended and its new cookie comes back as a header.
	const { headers: out, response: session } = await auth.api.getSession({
		headers,
		returnHeaders: true
	});
	const user = session?.user;
	if (!user?.learnerId || user.banned) return null;
	return {
		userId: user.id,
		identity: { learnerId: user.learnerId, displayName: user.name, role: roleOf(user.role) },
		mustChangePassword: user.mustChangePassword ?? false,
		refreshedCookies: out.getSetCookie()
	};
}

// The refusal of a sign-in whose password changed under it: the same answer as a wrong password.
const staleCredential = () =>
	new APIError('UNAUTHORIZED', {
		message: 'Invalid email or password',
		code: 'INVALID_EMAIL_OR_PASSWORD'
	});

/**
 * What a password sign-in checked: whose password, and the credential generation it was checked under.
 * `null`s are the record of a sign-in for which the hook found no user or no password: nothing was recorded to
 * check against, and such a sign-in can create no session (see `bind`).
 */
type CredentialChecked = { userId: string | null; generation: string | null };

/**
 * Requests whose sessions check no password, by the endpoint path: a sign-up (a new Account with its first
 * session), a provider's callback (no password is involved), and the password change's own replacement
 * session (made after the change, for the signed-in user). They are bound to the generation current when they
 * are made. Every other path that creates a session is a password sign-in and is held to its record.
 */
const SESSIONS_WITHOUT_A_PASSWORD_CHECK = ['/sign-up/email', '/callback/:id', '/change-password'];

/** The pieces `createAuth` wires in: the generation's write, its bind, its check and the sign-in record. */
export function createSessionBinding(db: Db) {
	/**
	 * The credential generation of an Account: the value `credentialGeneration` of its password Account, which the
	 * hooks below replace in the very write that replaces the hash, or "" when it has none. A session is bound to
	 * the generation it was created under and resolves only while that is still the current one.
	 */
	async function currentGeneration(userId: string): Promise<string> {
		return (await passwordGeneration(userId)) ?? '';
	}

	/** The generation of the Account's password Account, or null when it has none. */
	async function passwordGeneration(userId: string): Promise<string | null> {
		const credential = await db.account.findFirst({
			where: passwordAccountWhere(userId),
			select: { credentialGeneration: true }
		});
		return credential ? credential.credentialGeneration : null;
	}

	/**
	 * The generation a new session is bound to, or a refusal. A password sign-in is bound to the generation the
	 * request hook recorded before it checked the password, and fails closed: with no record, a record for another
	 * user, or one holding nothing (the hook found no Account, which may have been made since), or when the
	 * generation has moved on since, it creates no session. The row is written already holding that generation, so
	 * a sign-in that loses the race after this check still never resolves.
	 */
	async function bind(ctx: unknown, userId: string): Promise<string> {
		const endpoint = ctx as
			| { path?: string; credentialChecked?: CredentialChecked }
			| null
			| undefined;
		if (endpoint?.path && SESSIONS_WITHOUT_A_PASSWORD_CHECK.includes(endpoint.path)) {
			return currentGeneration(userId);
		}
		const checked = endpoint?.credentialChecked;
		if (!checked || checked.userId !== userId || checked.generation === null)
			throw staleCredential();
		if ((await currentGeneration(userId)) !== checked.generation) throw staleCredential();
		return checked.generation;
	}

	return {
		/**
		 * The write. The credential generation changes in the same write as the password hash, whoever writes it:
		 * Better Auth's password change (`updateAccount`), the admin's reset (`updatePassword`, or `createAccount`
		 * when the Account had no password, as a GitHub/Google-only one), the reset command (`updatePassword`), and
		 * the creation of a password Account. All of them go through these hooks, in the statement that writes the
		 * hash. Provider tokens: `encryptOAuthTokens` covers the access and refresh tokens, not the ID token
		 * (Google's), which the app never reads. It is not stored at all, so no plain ID token sits in the row.
		 */
		accountHooks: {
			create: {
				before: async (account: { providerId?: string }) => ({
					data: {
						...account,
						idToken: null,
						...(account.providerId === PASSWORD_PROVIDER_ID
							? { credentialGeneration: createId() }
							: {})
					}
				})
			},
			update: {
				before: async (account: object) => ({
					data: {
						...account,
						idToken: null,
						...('password' in account ? { credentialGeneration: createId() } : {})
					}
				})
			}
		},

		/**
		 * The bind. A password sign-in verifies the password, then creates the session, and the two are not one step.
		 * A writer (an admin's reset, the reset command, a password change) can change the password and end every
		 * session in between. Every session is therefore written bound to a credential generation (the one the
		 * sign-in checked), refused before it is written when that is no longer current, and checked again once
		 * written. A session whose generation is not the current one never resolves (`afterGetSession`), so a
		 * failed deletion, by the writer or by the cleanup here, cannot leave a usable session.
		 */
		sessionHooks: {
			create: {
				before: async (session: { userId: string }, ctx: unknown) => ({
					data: { credentialGeneration: await bind(ctx, session.userId) }
				}),
				after: async (session: { id: string; userId: string } | null | undefined) => {
					if (!session) return;
					const bound = (session as { credentialGeneration?: string }).credentialGeneration;
					if (bound === (await currentGeneration(session.userId))) return;
					// A writer landed between the check and the insert. The row holds the old generation, so it
					// cannot resolve whether or not this delete works; the error leaves before the cookie is set.
					await db.session.deleteMany({ where: { id: session.id } }).catch(() => undefined);
					throw staleCredential();
				}
			}
		},

		/**
		 * The check, for the `/get-session` after-hook. A session resolves only under the credential generation it
		 * was created under. Every path that accepts a session for the app goes through here: the identity of a
		 * request (`multi-user.ts`), and the actions that check the session first (`accounts.ts`,
		 * `routes/account/password`). Returns the response to send instead, or undefined to let it through.
		 */
		async afterGetSession(ctx: {
			context: { returned?: unknown };
			json: (value: null) => unknown;
		}) {
			const found = ctx.context.returned as
				| { session?: { id: string; userId: string; credentialGeneration?: string } }
				| null
				| undefined;
			const session = found && !isAPIError(found) ? found.session : undefined;
			if (session && session.credentialGeneration !== (await currentGeneration(session.userId))) {
				await db.session.deleteMany({ where: { id: session.id } }).catch(() => undefined);
				return ctx.json(null);
			}
			return;
		},

		/**
		 * The sign-in record, for the `/sign-in/email` before-hook. Before the password is checked: record which
		 * password that will be (see `sessionHooks`). Always recorded, with nulls when there is nothing to record: a
		 * sign-in that finds an Account later (made after this read) has no record to match and creates no session.
		 */
		async beforeSignIn(ctx: { body?: { email?: unknown } }) {
			const email = ctx.body?.email;
			const user =
				typeof email === 'string'
					? await db.user.findUnique({ where: { email: emailKey(email) }, select: { id: true } })
					: null;
			const generation = user ? await passwordGeneration(user.id) : null;
			const checked: CredentialChecked = {
				userId: user && generation !== null ? user.id : null,
				generation
			};
			return { context: { credentialChecked: checked } };
		}
	};
}
