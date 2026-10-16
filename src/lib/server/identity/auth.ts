import { randomUUID as createId } from 'node:crypto';
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

/**
 * The private header the limiter reads the client address from. The auth route overwrites it with
 * the address SvelteKit resolved, so a client cannot choose its own bucket (see `handleAuthRequest`).
 */
export const CLIENT_IP_HEADER = 'x-beyondleetcode-client-ip';

export const MIN_SECRET_LENGTH = 32;

/** The secret Better Auth falls back to when none is set (`utils/constants` in better-auth 1.7.x). */
const BETTER_AUTH_DEFAULT_SECRET = 'better-auth-secret-12345678901234567890';

/**
 * A secret everyone can read: Better Auth's built-in default, or the `change-me...` placeholder that
 * `.env.example` ships (it is long enough to pass the length check). Signing sessions with either
 * lets anyone forge them, so it is treated like no secret at all.
 */
export function isPlaceholderSecret(secret: string): boolean {
	const value = secret.trim().toLowerCase();
	return value === BETTER_AUTH_DEFAULT_SECRET || value.startsWith('change-me');
}
/** The longest name an Account may have: 100 characters, counted in Unicode code points on the trimmed name. */
export const MAX_NAME_LENGTH = 100;

/**
 * Whether a name is over the cap. The name is trimmed first (the forms store it trimmed), then counted by
 * code point, so an emoji is one character and not its two UTF-16 units. Cheap on any size of input: a code
 * point is one or two units, so up to 100 units is always within the cap and over 200 never is.
 */
export function isNameTooLong(name: string): boolean {
	const trimmed = name.trim();
	if (trimmed.length <= MAX_NAME_LENGTH) return false;
	if (trimmed.length > 2 * MAX_NAME_LENGTH) return true;
	return [...trimmed].length > MAX_NAME_LENGTH;
}

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

// Password sign-in is not served over HTTP at all. Better Auth's limiter keys on the address alone
// and only covers requests through `auth.handler`; the Sign in form action (`routes/signin`) calls
// `auth.api` and carries the per-Account limits (`throttle.ts`), so it is the one way in with a
// password. Server-side `auth.api.signInEmail` calls are not HTTP paths and are unaffected.
const HTTP_SIGN_IN_PATHS = ['/sign-in/email'];

const signUpClosed = () => new APIError('FORBIDDEN', { message: 'Sign-up is closed' });

/** A fixed message and code: the forms map the code to their own text, and the name is never echoed. */
const nameTooLong = () =>
	new APIError('BAD_REQUEST', { message: 'The name is too long.', code: 'NAME_TOO_LONG' });

/** Better Auth over our database: email + password and the admin plugin, nothing else. */
export function createAuth({
	db,
	origin,
	secret,
	admitSignUp = () => null,
	extraPlugins = []
}: CreateAuthOptions) {
	if (secret.length < MIN_SECRET_LENGTH) {
		throw new Error('createAuth: secret is missing or shorter than 32 characters');
	}
	if (isPlaceholderSecret(secret)) {
		throw new Error('createAuth: secret is a placeholder or default value anyone can read');
	}
	return betterAuth({
		database: prismaAdapter(db, { provider: 'sqlite' }),
		secret,
		...(origin ? { baseURL: origin } : {}),
		advanced: {
			// Explicit, because left unset Better Auth 1.7.7 skips the origin and CSRF checks whenever
			// NODE_ENV is "test" or TEST is set, in production too (`skipOriginCheck` in create-context).
			// An explicit false wins over that detection. Never turn this on: it is what stops a page on
			// another site from posting to the auth endpoints with a signed-in visitor's cookie.
			disableOriginCheck: false,
			...(origin ? { useSecureCookies: origin.startsWith('https:') } : {}),
			// Only the header our own route sets: X-Forwarded-For is client-controlled and never read.
			// IPv6 clients are grouped by /64 (Better Auth's default, stated here so it cannot change under us).
			// Not /128: whoever holds a /64 controls all of its addresses, so a finer key would let them
			// rotate addresses without limit (sign-up and the other endpoints have no per-Account backstop).
			// The cost is that clients in one LAN /64 share a budget, the same trade-off throttle.ts makes.
			ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER], ipv6Subnet: 64 }
		},
		// On explicitly (Better Auth defaults it to production only), in memory (one process owns the
		// Instance). Covers requests through `auth.handler`; server-side `auth.api` calls skip it.
		rateLimit: {
			enabled: true,
			storage: 'memory',
			// Better Auth's own rule for sign-up is 3 per 10 seconds per address, about 1,080 an hour, 54
			// times what the Sign up form allows (20 per 10 minutes). A script that posts straight to this
			// endpoint skips the form, so it gets the same budget as the form.
			customRules: { '/sign-up/email': { window: 600, max: 20 } }
		},
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
						// After the admission, so a closed sign-up answers the same whatever the name; before the
						// Learner below, so a refused name leaves nothing behind. Whatever path made the Account
						// (the form, POST /sign-up/email, a later one) comes through here.
						if (isNameTooLong(user.name)) throw nameTooLong();
						// A named Learner (the Local one) already exists or is made here and is never removed.
						// A fresh one is only named here and made in `after`, once the Account row is in, so a
						// failed insert (a duplicate email, a concurrent sign-up) leaves no Learner behind.
						if (admission.learnerId) {
							await db.learner.upsert({
								where: { id: admission.learnerId },
								update: {},
								create: { id: admission.learnerId }
							});
						}
						const learnerId = admission.learnerId ?? createId();
						return {
							data: {
								...user,
								// Stored trimmed, as the forms send it: the cap counts the trimmed name, so padding
								// must not be kept either.
								name: user.name.trim(),
								learnerId,
								...(admission.role ? { role: admission.role } : {})
							}
						};
					},
					after: async (user) => {
						const { learnerId } = user as { learnerId?: string | null };
						if (!learnerId) return;
						await db.learner.upsert({
							where: { id: learnerId },
							update: {},
							create: { id: learnerId }
						});
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
		disabledPaths: [...UNUSED_ADMIN_PATHS, ...UNUSED_CORE_PATHS, ...HTTP_SIGN_IN_PATHS],
		plugins: [admin({ defaultRole: 'learner' }), ...extraPlugins]
	});
}

export type Auth = ReturnType<typeof createAuth>;
