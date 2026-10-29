import { randomUUID as createId } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import type { Db } from '../db.ts';
import { redactingLogger } from '../logging.ts';
import {
	INVITE_COOKIE,
	INVITE_COOKIE_PATH,
	INVITE_LOG_PATTERNS,
	inviteTokenFrom
} from './invites.ts';
import { createSessionBinding } from './session-binding.ts';

// The invite cookie lives with Invites; re-exported so callers that import it from here keep working.
export { INVITE_COOKIE, INVITE_COOKIE_PATH, inviteTokenFrom };

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

/**
 * Whether a redirect target is, or normalizes to, a path starting with `//` or `/\\`, which a browser or a later
 * step would take for another site. Dot segments are resolved first (`/.//evil.com` is `//evil.com`).
 */
function isProtocolRelative(target: string): boolean {
	if (/^\/[/\\]/.test(target)) return true;
	try {
		return /^\/[/\\]/.test(new URL(target, 'http://placeholder.invalid').pathname);
	} catch {
		return true;
	}
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

/**
 * C0 and C1 controls (U+0000-U+001F, U+007F-U+009F) and the bidi controls (U+202A-U+202E, U+2066-U+2069):
 * they let a name spoof its own display on the Users page and in the nav. Everything else is allowed,
 * including U+200D (emoji sequences) and the zero-width U+200B and U+2060.
 */
// \p{Cc} is exactly U+0000-U+001F and U+007F-U+009F.
const FORBIDDEN_NAME_CHARACTERS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

/** Whether a name, as it would be stored (trimmed), holds a control or bidi character. */
export function hasForbiddenNameCharacter(name: string): boolean {
	return FORBIDDEN_NAME_CHARACTERS.test(name.trim());
}

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

// With a code, so that the provider callback (which turns an APIError that has one into a redirect to the
// error page with `?error=<code>`) sends the visitor back to Sign in; without one it would answer a bare 403.
const signUpClosed = () =>
	new APIError('FORBIDDEN', { message: 'Sign-up is closed', code: 'SIGN_UP_CLOSED' });

// Fixed messages and codes: the forms map the code to their own text, and the name is never echoed.
const nameTooLong = () =>
	new APIError('BAD_REQUEST', { message: 'The name is too long.', code: 'NAME_TOO_LONG' });
const nameInvalidCharacters = () =>
	new APIError('BAD_REQUEST', {
		message: "This name contains a character that can't be used.",
		code: 'NAME_INVALID_CHARACTERS'
	});
const nameRequired = () =>
	new APIError('BAD_REQUEST', { message: 'Enter a name.', code: 'NAME_REQUIRED' });

/**
 * The refusal for a name, or null if it is fine: blank once trimmed, over the cap, or holding a control or
 * bidi character. The cap is checked before the characters, so a huge name is never scanned.
 */
function nameRefusal(name: string): APIError | null {
	if (name.trim() === '') return nameRequired();
	if (isNameTooLong(name)) return nameTooLong();
	return hasForbiddenNameCharacter(name) ? nameInvalidCharacters() : null;
}

/** Control and bidi characters, globally: what a provider's name loses before the Account is made. */
const FORBIDDEN_NAME_CHARACTERS_ALL = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;

/** `text` as a name: forbidden characters taken out, trimmed, at most 100 characters (by code point). */
function cleanName(text: unknown): string {
	if (typeof text !== 'string') return '';
	const cleaned = text.replace(FORBIDDEN_NAME_CHARACTERS_ALL, '').trim();
	return [...cleaned].slice(0, MAX_NAME_LENGTH).join('').trim();
}

/**
 * The name an Account made through a provider gets. The provider's name (GitHub falls back to the login),
 * with control and bidi characters removed and cut to 100 characters; with nothing left, the email's part
 * before the `@`, cleaned the same way. Always a string, so `user.create.before` never sees a missing name,
 * and what it sees passes `nameRefusal` unless even the email gives nothing, which it then refuses.
 */
export function providerName(name: unknown, login: unknown, email: unknown): string {
	const local = typeof email === 'string' ? (email.split('@')[0] ?? '') : '';
	return cleanName(name) || cleanName(login) || cleanName(local);
}

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
	if (secret.length < MIN_SECRET_LENGTH) {
		throw new Error('createAuth: secret is missing or shorter than 32 characters');
	}
	if (isPlaceholderSecret(secret)) {
		throw new Error('createAuth: secret is a placeholder or default value anyone can read');
	}
	const binding = createSessionBinding(db);

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
		// whole `nameRefusal` first (blank, the 100-character cap, control and bidi characters).
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
			user: {
				create: {
					// The one choke point for every Account creation; the rules live in registration.ts.
					before: async (user, ctx) => {
						const admission =
							ctx &&
							(await admitSignUp({
								email: user.email,
								inviteToken: inviteTokenFrom(ctx.headers ?? ctx.request?.headers)
							}));
						if (!admission) throw signUpClosed();
						// After the admission, so a closed sign-up answers the same whatever the name; before the
						// Learner below, so a refused name leaves nothing behind. Whatever path made the Account
						// (the form, POST /sign-up/email, a later one) comes through here. For a sign-up over HTTP
						// the request hook below has already asked, so this is the backstop.
						// A provider can send no name at all (`providerName` maps that away, this is the backstop): a missing
						// one is "enter a name", not a crash in `trim()`.
						const refusal = typeof user.name === 'string' ? nameRefusal(user.name) : nameRequired();
						if (refusal) throw refusal;
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
						// An Invite is spent here, last, before anything is written: Better Auth has already refused a
						// duplicate email (`sign-up.mjs:192`) and writes the User (:217), the credential Account (:235)
						// and the Session (:255) only after this hook returns. A lost claim (used, expired, cancelled, a
						// concurrent sign-up) is one conditional update that changed no row: refused, nothing written.
						// The gate (here and in the request hook) only checked. A failure after the claim (the insert,
						// the Account, the Session, the Learner) leaves the Invite spent; the admin reissues it.
						// (A Session insert failure leaves the invitee's one Account, usable, beside the spent Invite.) A claim that throws is refused the same way and writes nothing.
						if (admission.inviteToken && !(await claimInvite(admission.inviteToken, new Date()))) {
							throw signUpClosed();
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
						// Better Auth 1.7.7 defers this hook while the sign-up transaction is open
						// (`queueAfterTransactionHook`, transaction.mjs:96), so it runs after the User, the credential
						// Account and the Session are written and the cookie is set (`sign-up.mjs:144-257`). A throw
						// here is the Learner not being made: the User is removed (its Account and Session go with it,
						// `onDelete: Cascade`) and the sign-up refused. A fresh Learner is made only now, so a failed
						// insert or a refused claim never leaves one behind.
						const { learnerId } = user as { learnerId?: string | null };
						if (!learnerId) return;
						try {
							await db.learner.upsert({
								where: { id: learnerId },
								update: {},
								create: { id: learnerId }
							});
						} catch (error) {
							try {
								await db.user.deleteMany({ where: { id: user.id } });
							} catch {
								// A fixed line: the error text may hold query text and the input.
								console.error('Sign up: removing an Account after its Learner failed also failed.');
							}
							throw error;
						}
					}
				}
			}
		},
		// Asked first, so a closed sign-up answers 403 whether or not the email exists (otherwise the
		// duplicate-email 422 would reveal which emails have Accounts). The name is checked next, for the same
		// reason: Better Auth looks the email up before the database hook runs, so a name refused only there
		// would answer 400 for an email with no Account and 422 for one that has. The database hook is the backstop.
		hooks: {
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path === '/get-session') return binding.afterGetSession(ctx);
				if (!ctx.path.startsWith('/callback/')) return;
				const returned = ctx.context.returned;
				if (!isAPIError(returned)) return;
				const inviteToken = inviteTokenFrom(ctx.headers);
				// A session was made: an invite cookie, spent or not, has done its job. Judged by the session, not by
				// the shape of the redirect: the POST-to-GET bounce of a callback and a refusal both leave the cookie
				// for the request that still needs it, and a success whose destination has an `error` in its query
				// still clears it.
				if (ctx.context.newSession) {
					// The callback signed someone in: its start (the flood guard's count) is given back, by the
					// `state` the provider sent back in the query.
					const state = ctx.query?.state;
					if (typeof state === 'string') providerStarts?.refund(state);
					if (inviteToken) {
						ctx.setCookie(INVITE_COOKIE, '', {
							path: INVITE_COOKIE_PATH,
							maxAge: 0,
							httpOnly: true,
							sameSite: 'lax'
						});
					}
					return;
				}
				const location = new Headers(returned.headers as HeadersInit).get('location');
				if (!location) return;
				// Only the query of the original string is read and edited; nothing is rebuilt from a parsed URL.
				const cut = location.search(/[?#]/);
				const base = cut === -1 ? location : location.slice(0, cut);
				const tail = cut === -1 ? '' : location.slice(cut);
				const hashAt = tail.indexOf('#');
				const query = new URLSearchParams(
					(hashAt === -1 ? tail : tail.slice(0, hashAt)).replace(/^\?/, '')
				);
				const failure = query.get('error');
				// Better Auth looks the provider's email up before the creation hook, so where a sign-up is closed an
				// existing email would answer "not linked" and a new one "closed": a way to learn which emails have
				// Accounts. Where the gate would refuse this visitor, both answer the same, as the email form does
				// (the gate runs for a new Account too, so it is asked here with no email).
				if (failure !== 'account_not_linked' && failure !== 'SIGN_UP_CLOSED') return;
				if (
					failure === 'SIGN_UP_CLOSED' ||
					!(await admitSignUp({ email: undefined, inviteToken }))
				) {
					// The same redirect whichever refusal it was, description and all.
					query.set('error', 'SIGN_UP_CLOSED');
					query.delete('error_description');
					const rewritten = `${base}?${query}${hashAt === -1 ? '' : tail.slice(hashAt)}`;
					throw ctx.redirect(
						isProtocolRelative(rewritten) ? '/signin?error=SIGN_UP_CLOSED' : rewritten
					);
				}
			}),
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path === '/sign-in/email') return binding.beforeSignIn(ctx);
				if (ctx.path !== '/sign-up/email') return;
				if (
					!(await admitSignUp({
						email: ctx.body?.email,
						inviteToken: inviteTokenFrom(ctx.headers)
					}))
				) {
					throw signUpClosed();
				}
				const name = ctx.body?.name;
				const refusal = typeof name === 'string' ? nameRefusal(name) : null;
				if (refusal) throw refusal;
			})
		},
		disabledPaths: [...ADMIN_PATHS, ...UNUSED_CORE_PATHS, ...HTTP_SIGN_IN_PATHS],
		plugins: [admin({ defaultRole: 'learner' }), ...extraPlugins]
	});
}

export type Auth = ReturnType<typeof createAuth>;
