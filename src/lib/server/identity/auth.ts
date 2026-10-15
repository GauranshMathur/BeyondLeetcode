import type { BetterAuthPlugin } from 'better-auth';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import type { Db } from '../db.ts';

/** Admitted: which Learner the new Account owns (default a fresh one) and its role (default learner). */
export interface Admission {
	learnerId?: string;
	role?: 'admin' | 'learner';
}

/**
 * The registration gate: `null` refuses the sign-up, otherwise it is admitted as described.
 *
 * It runs twice per sign-up (the request hook, then the database hook), so it must stay free of
 * side effects. Anything consumed on admit, such as an invite, is consumed in a `user.create.after`
 * hook, never here.
 */
export type AdmitSignUp = (attempt: {
	email: string | undefined;
}) => Admission | null | Promise<Admission | null>;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export type CreateAuthOptions = {
	db: Db;
	/** The public origin, e.g. `https://learn.example.com`; empty when not known. */
	origin: string;
	secret: string;
	/** Who may sign up. Consulted on every new Account; the default is nobody. */
	admitSignUp?: AdmitSignUp;
	/** Plugins the caller owns, e.g. SvelteKit's cookie plugin (keeps `$app/*` out of this file). */
	extraPlugins?: BetterAuthPlugin[];
};

// The admin plugin endpoints we use: list users, set user password, revoke user sessions, remove
// user. Every other one is switched off over HTTP (the server-side `auth.api` still has them).
const UNUSED_ADMIN_PATHS = [
	'set-role',
	'create-user',
	'update-user',
	'get-user',
	'list-user-sessions',
	'revoke-user-session',
	'ban-user',
	'unban-user',
	'impersonate-user',
	'stop-impersonating',
	'has-permission'
].map((p) => `/admin/${p}`);

// Core endpoints we do not use: no profile edits, email change, account deletion, password reset
// by email, verification, social linking or token endpoints.
const UNUSED_CORE_PATHS = [
	'/update-user',
	'/verify-password',
	'/update-session',
	'/change-email',
	'/delete-user',
	'/delete-user/callback',
	'/request-password-reset',
	'/reset-password',
	'/send-verification-email',
	'/verify-email',
	'/link-social',
	'/unlink-account',
	'/refresh-token',
	'/get-access-token',
	'/account-info',
	'/list-accounts'
];

const signUpClosed = () => new APIError('FORBIDDEN', { message: 'Sign-up is closed' });

/** Better Auth over our database: email + password and the admin plugin, nothing else. */
export function createAuth({
	db,
	origin,
	secret,
	admitSignUp = () => null,
	extraPlugins = []
}: CreateAuthOptions) {
	if (secret.length < 32) {
		throw new Error('createAuth: secret is missing or shorter than 32 characters');
	}
	return betterAuth({
		database: prismaAdapter(db, { provider: 'sqlite' }),
		secret,
		...(origin
			? { baseURL: origin, advanced: { useSecureCookies: origin.startsWith('https:') } }
			: {}),
		telemetry: { enabled: false },
		emailAndPassword: {
			enabled: true,
			minPasswordLength: MIN_PASSWORD_LENGTH,
			maxPasswordLength: MAX_PASSWORD_LENGTH
		},
		// Emails are never verified, so an email must never join two Accounts.
		account: { accountLinking: { enabled: false } },
		// A removed or reset user must lose access on the next request.
		session: { cookieCache: { enabled: false } },
		user: {
			additionalFields: {
				// Not `required`: that would demand it in the sign-up body. The hook below always sets it.
				learnerId: { type: 'string', required: false, input: false },
				mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false }
			}
		},
		databaseHooks: {
			user: {
				create: {
					// The one choke point for every Account creation; the rules live in registration.ts.
					before: async (user, ctx) => {
						const admission = ctx && (await admitSignUp({ email: user.email }));
						if (!admission) throw signUpClosed();
						const learner = admission.learnerId
							? await db.learner.upsert({
									where: { id: admission.learnerId },
									update: {},
									create: { id: admission.learnerId }
								})
							: await db.learner.create({ data: {} });
						return {
							data: {
								...user,
								learnerId: learner.id,
								...(admission.role ? { role: admission.role } : {})
							}
						};
					}
				}
			}
		},
		// Asked first, so a closed sign-up answers 403 whether or not the email exists (otherwise the
		// duplicate-email 422 would reveal which emails have Accounts). The database hook is the backstop.
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== '/sign-up/email') return;
				if (!(await admitSignUp({ email: ctx.body?.email }))) throw signUpClosed();
			})
		},
		disabledPaths: [...UNUSED_ADMIN_PATHS, ...UNUSED_CORE_PATHS],
		plugins: [admin({ defaultRole: 'learner' }), ...extraPlugins]
	});
}

export type Auth = ReturnType<typeof createAuth>;
