import type { BetterAuthPlugin } from 'better-auth';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import type { Db } from '../db.ts';

export type CreateAuthOptions = {
	db: Db;
	/** The public origin, e.g. `https://learn.example.com`; empty when not known. */
	origin: string;
	secret: string;
	/** Who may sign up. Consulted on every new Account; the default is nobody. */
	allowSignUp?: () => boolean | Promise<boolean>;
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

/** Better Auth over our database: email + password and the admin plugin, nothing else. */
export function createAuth({
	db,
	origin,
	secret,
	allowSignUp = () => false,
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
		emailAndPassword: { enabled: true },
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
					// Who may sign up lives here; a later card moves the registration rules into it.
					before: async (user, ctx) => {
						if (!ctx || !(await allowSignUp())) {
							throw new APIError('FORBIDDEN', { message: 'Sign-up is closed' });
						}
						const learner = await db.learner.create({ data: {} });
						return { data: { ...user, learnerId: learner.id } };
					}
				}
			}
		},
		disabledPaths: UNUSED_ADMIN_PATHS,
		plugins: [admin({ defaultRole: 'learner' }), ...extraPlugins]
	});
}

export type Auth = ReturnType<typeof createAuth>;
