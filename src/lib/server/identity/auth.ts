import type { BetterAuthPlugin } from 'better-auth';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAuthMiddleware } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import type { Db } from '../db.ts';
import { redactingLogger } from '../logging.ts';
import { createAccountCreation, providerName } from './account-creation.ts';
import { INVITE_LOG_PATTERNS } from './invites.ts';
import { secretProblem } from './secret.ts';
import { createSessionBinding } from './session-binding.ts';

// The name rules live with account creation; the routes that import them from here keep working.
export {
	hasForbiddenNameCharacter,
	isNameTooLong,
	MAX_NAME_LENGTH,
	providerName
} from './account-creation.ts';

/** Admitted: which Learner the new Account owns (default a fresh one) and its role (default learner). */
export interface Admission {
	learnerId?: string;
	role?: 'admin' | 'learner';
	/** Set when an Invite is what admitted the sign-up: `user.create.before` claims it (it is spent there, before anything is written). */
	inviteToken?: string;
}

/**
 * The registration gate: `null` refuses the sign-up, otherwise it is admitted as described.
 *
 * It runs twice per sign-up (the request hook, then the database hook), so it must stay free of
 * side effects. Anything consumed on admit, such as an invite, is consumed in `user.create.before`
 * (after the admission and the name checks, before anything is written), never here.
 */
export type AdmitSignUp = (attempt: {
	email: string | undefined;
	/** The token in the invite cookie of the request, if any (see `INVITE_COOKIE`); unchecked. */
	inviteToken?: string;
}) => Admission | null | Promise<Admission | null>;

/**
 * The private header the limiter reads the client address from. The auth route overwrites it with
 * the address SvelteKit resolved, so a client cannot choose its own bucket (see `handleAuthRequest`).
 */
export const CLIENT_IP_HEADER = 'x-beyondleetcode-client-ip';

/** The OAuth providers this app can offer, by the id Better Auth knows them by. */
export const SOCIAL_PROVIDER_IDS = ['github', 'google'] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];
export type SocialProviders = Partial<
	Record<SocialProviderId, { clientId: string; clientSecret: string }>
>;

/** The display names the Sign in page puts on its buttons. */
export const SOCIAL_PROVIDER_NAMES: Record<SocialProviderId, string> = {
	github: 'GitHub',
	google: 'Google'
};

/**
 * The providers an environment enables: a provider is added only when both its variables are set (and not
 * blank). Half a pair is a provider that cannot work, so it is left out and its button is not shown.
 */
export function socialProvidersFrom(env: Record<string, string | undefined>): SocialProviders {
	const out: SocialProviders = {};
	for (const id of SOCIAL_PROVIDER_IDS) {
		const prefix = id.toUpperCase();
		const clientId = env[`${prefix}_CLIENT_ID`]?.trim();
		const clientSecret = env[`${prefix}_CLIENT_SECRET`]?.trim();
		if (clientId && clientSecret) out[id] = { clientId, clientSecret };
	}
	return out;
}

/** The providers a Better Auth instance has, for the Sign in page. */
export function enabledProviders(auth: {
	options: { socialProviders?: object };
}): SocialProviderId[] {
	const have = auth.options?.socialProviders ?? {};
	return SOCIAL_PROVIDER_IDS.filter((id) => id in have);
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
	/**
	 * Spends the Invite a sign-up was admitted on (`Invites.claim`); true only when this call spent it.
	 * Without it an invite admission is refused. Called in `user.create.before`, so before anything is written.
	 */
	claimInvite?: (token: string, now: Date) => Promise<boolean>;
	/**
	 * OAuth providers, each present only when both its client id and secret are set (see `socialProvidersFrom`).
	 * A sign-up through a provider goes through the same creation hooks as the email form.
	 */
	socialProviders?: SocialProviders;
	/** Plugins the caller owns, e.g. SvelteKit's cookie plugin (keeps `$app/*` out of this file). */
	extraPlugins?: BetterAuthPlugin[];
	/**
	 * The starts of provider sign-ins (`throttle.ts`). A provider callback that signs someone in gives back the
	 * start named by its `state`; without it nothing is given back.
	 */
	providerStarts?: { refund(state: string): void };
	/**
	 * Replaces Better Auth's password hashing. Tests pass a fast one (`test-auth.ts`); production code never does,
	 * so the stored hash stays Better Auth's default (scrypt).
	 */
	passwordHasher?: {
		hash(password: string): Promise<string>;
		verify(input: { hash: string; password: string }): Promise<boolean>;
	};
};

// Every admin plugin endpoint is switched off over HTTP, the four we use included (list-users,
// set-user-password, revoke-user-sessions, remove-user): the Users page reads and acts through
// `auth.api` (accounts.ts), which is not an HTTP path and keeps working. Left on, each bare endpoint skips
// what our actions add: remove-user leaves the Learner and all its progress behind, and set-user-password
// leaves the sessions and the must-change flag alone.
const ADMIN_PATHS = [
	'list-users',
	'set-user-password',
	'revoke-user-sessions',
	'remove-user',
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

// `/sign-in/social` is off over HTTP too: the Sign in page's provider buttons call `auth.api.signInSocial` with
// only a provider and fixed redirects, so no client can post its own `callbackURL`, `idToken` or `requestSignUp`.
// The provider's redirect back, `/callback/:id`, stays served: it is what the browser is sent to.
// Core endpoints we do not use over HTTP: no profile edits, email change, account deletion, password reset
// by email, verification, social linking or token endpoints. `/change-password` is one too: Better Auth's
// limiter alone would guard guesses of the current password there, so the Change password form
// (`routes/account/password`) is the one way, through `auth.api.changePassword` with the per-Account limits.
const UNUSED_CORE_PATHS = [
	'/change-password',
	'/sign-in/social',
	// The app ends sessions itself (`auth.api`, server-side); these would run on Better Auth's session middleware, which
	// does not apply the rule `/get-session` does for a session older than the password. `/sign-out` stays: the gate
	// lets an Account that must change its password sign out through it.
	'/list-sessions',
	'/revoke-session',
	'/revoke-sessions',
	'/revoke-other-sessions',
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

/** Better Auth over our database: email + password and the admin plugin, nothing else. */
export function createAuth({
	db,
	origin,
	secret,
	admitSignUp = () => null,
	claimInvite = async () => false,
	socialProviders = {},
	extraPlugins = [],
	providerStarts,
	passwordHasher
}: CreateAuthOptions) {
	const problem = secretProblem(secret, { lengthFirst: true });
	if (problem === 'placeholder') {
		throw new Error('createAuth: secret is a placeholder or default value anyone can read');
	}
	if (problem) {
		throw new Error('createAuth: secret is missing or shorter than 32 characters');
	}
	const binding = createSessionBinding(db);
	const creation = createAccountCreation({ db, admitSignUp, claimInvite, providerStarts });

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
		logger: redactingLogger(INVITE_LOG_PATTERNS),
		// An error that is not an APIError (a database failure) is rethrown to the caller, so SvelteKit's
		// `handleError` (which redacts the invite path) logs it. Left unset, Better Call prints it itself with
		// `console.error` (router.mjs:93), request text and all. APIErrors are still turned back into their
		// 403/422/400 responses by Better Call (router.mjs:84-89).
		onAPIError: { throw: true },
		telemetry: { enabled: false },
		// `autoSignIn` and `requireEmailVerification` must stay unset: the hooks refuse a sign-up with a 403, and
		// Better Auth turns a 403 into a fake success (its generic duplicate response) when either is set.
		emailAndPassword: {
			enabled: true,
			minPasswordLength: MIN_PASSWORD_LENGTH,
			maxPasswordLength: MAX_PASSWORD_LENGTH,
			...(passwordHasher ? { password: passwordHasher } : {})
		},
		// Emails are never verified, so an email must never join two Accounts: a provider sign-in whose email
		// belongs to an existing Account is refused, never linked.
		//
		// `overrideUserInfoOnSignIn` (set off on each provider below) and `updateUserInfoOnLink` (off by default,
		// and linking is off) are what would write a provider's name through updateUser, past `user.create.before`
		// and its name rules. They stay off; if one is ever turned on, a `user.update.before` hook must run the
		// whole name rules (`account-creation.ts`) first (blank, the 100-character cap, control and bidi characters).
		//
		// Provider tokens are stored encrypted (with the secret), and never handed to a browser: the endpoints that
		// would (`/get-access-token`, `/refresh-token`, `/account-info`) are off.
		account: {
			accountLinking: { enabled: false },
			encryptOAuthTokens: true,
			additionalFields: {
				// Set by `databaseHooks.account`; never taken from a request.
				credentialGeneration: { type: 'string', required: false, input: false }
			}
		},
		// Added only when both of a provider's variables were set. Its profile name is mapped to a name the rules
		// accept (`providerName`); the Account itself is made by `user.create.before` like any other.
		socialProviders: {
			...(socialProviders.github && {
				github: {
					...socialProviders.github,
					overrideUserInfoOnSignIn: false,
					mapProfileToUser: (profile) => ({
						name: providerName(profile.name, profile.login, profile.email)
					})
				}
			}),
			...(socialProviders.google && {
				google: {
					...socialProviders.google,
					overrideUserInfoOnSignIn: false,
					mapProfileToUser: (profile) => ({
						name: providerName(profile.name, profile.given_name, profile.email)
					})
				}
			})
		},
		// A removed or reset user must lose access on the next request.
		session: {
			cookieCache: { enabled: false },
			additionalFields: {
				// Set by `databaseHooks.session.create.before`; never taken from a request.
				credentialGeneration: { type: 'string', required: false, input: false }
			}
		},
		user: {
			additionalFields: {
				// Not `required`: that would demand it in the sign-up body. The hook below always sets it.
				learnerId: { type: 'string', required: false, input: false },
				mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false }
			}
		},
		databaseHooks: {
			// Provider tokens: `encryptOAuthTokens` covers the access and refresh tokens, not the ID token (Google's), which
			// the app never reads. It is not stored at all, so no plain ID token sits in the Account row.
			//
			// The credential generation changes in the same write as the password hash, whoever writes it: Better Auth's
			// password change (`updateAccount`), the admin's reset (`updatePassword`, or `createAccount` when the Account
			// had no password, as a GitHub/Google-only one), the reset command (`updatePassword`), and the
			// creation of a password Account. All of them go through these hooks, in the statement that writes the hash.
			account: binding.accountHooks,
			session: binding.sessionHooks,
			user: creation.userHooks
		},
		hooks: {
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path === '/get-session') return binding.afterGetSession(ctx);
				return creation.afterCallback(ctx);
			}),
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path === '/sign-in/email') return binding.beforeSignIn(ctx);
				return creation.beforeSignUp(ctx);
			})
		},
		disabledPaths: [...ADMIN_PATHS, ...UNUSED_CORE_PATHS, ...HTTP_SIGN_IN_PATHS],
		plugins: [admin({ defaultRole: 'learner' }), ...extraPlugins]
	});
}

export type Auth = ReturnType<typeof createAuth>;
