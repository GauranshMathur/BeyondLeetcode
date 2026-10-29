import { randomUUID as createId } from 'node:crypto';
import { APIError, type createAuthMiddleware, isAPIError } from 'better-auth/api';
import type { Db } from '../db.ts';
import { CONTROL_OR_BIDI } from '../logging.ts';
import type { AdmitSignUp, CreateAuthOptions } from './auth.ts';
import { isProtocolRelative } from './gate.ts';
import { INVITE_COOKIE, INVITE_COOKIE_PATH, inviteTokenFrom } from './invites.ts';

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
 * Whether a name, as it would be stored (trimmed), holds a control or bidi character (`CONTROL_OR_BIDI`): they let
 * a name spoof its own display on the Users page and in the nav. Everything else is allowed, including U+200D
 * (emoji sequences) and the zero-width U+200B and U+2060.
 */
export function hasForbiddenNameCharacter(name: string): boolean {
	return CONTROL_OR_BIDI.test(name.trim());
}

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
const CONTROL_OR_BIDI_ALL = new RegExp(CONTROL_OR_BIDI.source, 'gu');

/** `text` as a name: forbidden characters taken out, trimmed, at most 100 characters (by code point). */
function cleanName(text: unknown): string {
	if (typeof text !== 'string') return '';
	const cleaned = text.replace(CONTROL_OR_BIDI_ALL, '').trim();
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

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * How an Account comes to exist, as the hooks createAuth wires in: the admission, the name rules, the Invite
 * claim and the Learner (`user.create` before and after), the sign-up request hook, and the rewrite of a
 * provider callback's refusal. `admitSignUp` runs twice per sign-up (the request hook, then the database
 * hook), so it must stay free of side effects: an Invite is spent in `user.create.before`, never there.
 */
export function createAccountCreation({
	db,
	admitSignUp,
	claimInvite,
	providerStarts
}: {
	db: Db;
	admitSignUp: AdmitSignUp;
	claimInvite: NonNullable<CreateAuthOptions['claimInvite']>;
	providerStarts: CreateAuthOptions['providerStarts'];
}) {
	return {
		/** `databaseHooks.user`: the one choke point for every Account creation; the rules live in registration.ts. */
		userHooks: {
			create: {
				before: async (user: { email?: string; name?: string }, ctx: unknown) => {
					const context = ctx as {
						headers?: Headers;
						request?: { headers?: Headers };
					} | null;
					const admission =
						context &&
						(await admitSignUp({
							email: user.email,
							inviteToken: inviteTokenFrom(context.headers ?? context.request?.headers)
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
							name: user.name?.trim(),
							learnerId,
							...(admission.role ? { role: admission.role } : {})
						}
					};
				},
				after: async (user: { id: string }) => {
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
		},

		/**
		 * The request hook for `/sign-up/email`, asked first, so a closed sign-up answers 403 whether or not the
		 * email exists (otherwise the duplicate-email 422 would reveal which emails have Accounts). The name is
		 * checked next, for the same reason: Better Auth looks the email up before the database hook runs, so a
		 * name refused only there would answer 400 for an email with no Account and 422 for one that has. The
		 * database hook is the backstop.
		 */
		async beforeSignUp(ctx: HookContext) {
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
		},

		/** The after hook for a provider's `/callback/:id`: the start given back, the invite cookie cleared, a refusal rewritten. */
		async afterCallback(ctx: HookContext) {
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
			if (failure === 'SIGN_UP_CLOSED' || !(await admitSignUp({ email: undefined, inviteToken }))) {
				// The same redirect whichever refusal it was, description and all.
				query.set('error', 'SIGN_UP_CLOSED');
				query.delete('error_description');
				const rewritten = `${base}?${query}${hashAt === -1 ? '' : tail.slice(hashAt)}`;
				throw ctx.redirect(
					isProtocolRelative(rewritten) ? '/signin?error=SIGN_UP_CLOSED' : rewritten
				);
			}
		}
	};
}
