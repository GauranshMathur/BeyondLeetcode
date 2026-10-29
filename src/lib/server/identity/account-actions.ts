import { createHash } from 'node:crypto';
import { isAPIError } from 'better-auth/api';
import { z } from 'zod';
import { logFailure } from '../logging.ts';
import {
	type Auth,
	enabledProviders,
	hasForbiddenNameCharacter,
	isNameTooLong,
	MAX_NAME_LENGTH,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	SOCIAL_PROVIDER_NAMES,
	type SocialProviderId
} from './auth.ts';
import { INVITE_COOKIE } from './invites.ts';
import { currentSession, emailKey } from './session-binding.ts';
import {
	createThrottle,
	type ProviderStarts,
	type Throttle,
	type ThrottleInput
} from './throttle.ts';

/** The limits the account forms check: a name's longest length and a password's shortest and longest. */
export const ACCOUNT_LIMITS = {
	nameMax: MAX_NAME_LENGTH,
	passwordMin: MIN_PASSWORD_LENGTH,
	passwordMax: MAX_PASSWORD_LENGTH
} as const;

/**
 * One code per message the account forms show. A route turns a code into its text; no code carries one.
 *
 * - `WRONG_SIGN_IN`: "Email or password is wrong." (also for too many sign-in attempts, as the limits count per Account)
 * - `SIGN_IN_FAILED`: "Signing in failed. Try again." (a failure: the lookup, Better Auth, a provider start that did not work)
 * - `PROVIDER_REFUSED`: "Signing in failed. Try again." (a provider start refused up front: an unknown provider, or past the start limit)
 * - `SIGN_UP_FAILED`: "The account could not be created. Try again."
 * - `NAME_REQUIRED`: "Enter a name."
 * - `NAME_TOO_LONG`: "Use at most 100 characters."
 * - `NAME_INVALID_CHARACTERS`: "This name contains a character that can't be used."
 * - `INVALID_EMAIL`: "Enter an email address like name@example.com."
 * - `PASSWORD_TOO_SHORT`: "Use at least 12 characters." (sign up, accept, and the new password)
 * - `PASSWORD_TOO_LONG`: "Use at most 128 characters." (the same)
 * - `EMAIL_UNAVAILABLE`: "This email cannot be used. Try a different one."
 * - `SIGN_UP_CLOSED`: "Sign-up is closed."
 * - `INVITE_INVALID`: "This invite link does not work."
 * - `TOO_MANY_ATTEMPTS`: "Too many attempts. Try again in a few minutes." (sign up and accept; carries `retryAfterSeconds`)
 * - `WRONG_CURRENT_PASSWORD`: "That is not your current password." (also for too many tries)
 * - `PASSWORDS_DO_NOT_MATCH`: "The two new passwords do not match."
 * - `NO_PASSWORD`: "Your Account has no password: you sign in with GitHub or Google. There is nothing to change here."
 * - `SAME_PASSWORD`: "Choose a password different from your current one."
 * - `CHANGE_FAILED`: "Changing your password failed, and it may have changed. You are signed out of every session. ..."
 * - `CHANGE_UNENDED`: "Changing your password failed, and it may have changed. Other sessions may still be signed in. ..."
 * - `NOT_SIGNED_IN`: no text; the route sends the visitor to Sign in (no session, or Better Auth said 401)
 * - `SIGN_OUT_FAILED`: "Signing out failed. Try again."
 * - `MUST_CHANGE_HOLD`: no text; Sign out failed for a user who must change their password: the route sends them to Change password
 */
export const REFUSAL_CODES = [
	'WRONG_SIGN_IN',
	'SIGN_IN_FAILED',
	'PROVIDER_REFUSED',
	'SIGN_UP_FAILED',
	'NAME_REQUIRED',
	'NAME_TOO_LONG',
	'NAME_INVALID_CHARACTERS',
	'INVALID_EMAIL',
	'PASSWORD_TOO_SHORT',
	'PASSWORD_TOO_LONG',
	'EMAIL_UNAVAILABLE',
	'SIGN_UP_CLOSED',
	'INVITE_INVALID',
	'TOO_MANY_ATTEMPTS',
	'WRONG_CURRENT_PASSWORD',
	'PASSWORDS_DO_NOT_MATCH',
	'NO_PASSWORD',
	'SAME_PASSWORD',
	'CHANGE_FAILED',
	'CHANGE_UNENDED',
	'NOT_SIGNED_IN',
	'SIGN_OUT_FAILED',
	'MUST_CHANGE_HOLD'
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

/** The form field a refusal belongs to. The sign-up forms use the first three, Change password the last three. */
export type AccountField = 'name' | 'email' | 'password' | 'current' | 'new' | 'confirm';

export interface Refusal {
	refused: RefusalCode;
	field?: AccountField;
	/** Only `TOO_MANY_ATTEMPTS`: whole seconds for the `retry-after` header. */
	retryAfterSeconds?: number;
}

/** What an action that ends in cookies answers: the `Set-Cookie` values to send on. */
export interface Cookies {
	cookies: string[];
}

export interface AccountActions {
	/** The providers this Instance offers, one button each. */
	providers(): { id: SocialProviderId; name: string }[];
	/**
	 * The signed-in Account's state, or null when the headers name no session. `forced`: it must change its
	 * password; `hasPassword`: it has a password to change (a GitHub/Google-only Account has none).
	 */
	status(headers: Headers): Promise<{ forced: boolean; hasPassword: boolean } | null>;
	signIn(input: { email: string; password: string; address: string }): Promise<Cookies | Refusal>;
	/** `next` is a path on this site, already checked by the caller. `location` is the provider's authorize URL. */
	startProvider(input: {
		provider: string;
		next: string;
		address: string;
	}): Promise<(Cookies & { location: string }) | Refusal>;
	/**
	 * Name and email as typed (trimmed here). The order is today's: charge, read the fields, the throttle's
	 * refusal, then the check (`SIGN_UP_CLOSED` when the Registration Mode is closed; with an `invite` token,
	 * `INVITE_INVALID` when it names no usable Invite), then the field checks. With an `invite` the sign-up
	 * counts against Accept invite's limit and a 403 from the gate means the Invite does not work; without,
	 * against Sign up's and a 403 means sign-up is closed.
	 */
	signUp(input: {
		/**
		 * The typed fields, read after the attempt is counted (the routes read the body after charging): a
		 * body that fails to parse is charged, and `fields` throws out of `signUp`.
		 */
		fields: () => Promise<{ name: string; email: string; password: string }>;
		address: string;
		invite?: string;
	}): Promise<Cookies | Refusal>;
	/**
	 * `forced`: the Account had to change its password. `flagCleared`: the must-change flag is clear (true when
	 * not forced); false means the password changed but clearing the flag failed.
	 */
	changePassword(input: {
		headers: Headers;
		current: string;
		next: string;
		confirm: string;
		address: string;
	}): Promise<(Cookies & { forced: boolean; flagCleared: boolean }) | Refusal>;
	signOut(input: { headers: Headers }): Promise<Cookies | Refusal>;
}

const refuse = (refused: RefusalCode, field?: AccountField): Refusal =>
	field ? { refused, field } : { refused };

/**
 * The code for a Better Auth refusal of a sign-up, or null when it is a failure. A 403 is the registration
 * gate or the claim saying no: `SIGN_UP_CLOSED` here (`signUp` turns it into `INVITE_INVALID` for an Invite).
 */
export function refusalOf(error: unknown): Refusal | null {
	if (!isAPIError(error)) return null;
	if (error.statusCode === 403) return refuse('SIGN_UP_CLOSED');
	switch (error.body?.code) {
		case 'USER_ALREADY_EXISTS':
		case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
			return refuse('EMAIL_UNAVAILABLE', 'email');
		case 'NAME_REQUIRED':
			return refuse('NAME_REQUIRED', 'name');
		case 'NAME_TOO_LONG':
			return refuse('NAME_TOO_LONG', 'name');
		case 'NAME_INVALID_CHARACTERS':
			return refuse('NAME_INVALID_CHARACTERS', 'name');
		case 'INVALID_EMAIL':
			return refuse('INVALID_EMAIL', 'email');
		case 'PASSWORD_TOO_SHORT':
			return refuse('PASSWORD_TOO_SHORT', 'password');
		case 'PASSWORD_TOO_LONG':
			return refuse('PASSWORD_TOO_LONG', 'password');
		default:
			return null;
	}
}

/**
 * The limits' stand-in for an email that has no Account: a digest of the normalised email (`emailKey`), so
 * the email itself is never held in memory. Known and unknown emails then reach the throttled state on the
 * same schedule. It goes in its own field, not in `accountId` (`throttle.ts`).
 */
const emailDigest = (email: string) => createHash('sha256').update(emailKey(email)).digest('hex');

/** Better Auth answers 400 to an email or password it will not look at and 401 to a wrong one. */
const isWrongSignIn = (error: unknown) =>
	isAPIError(error) && (error.statusCode === 400 || error.statusCode === 401);

/** Whether the Account has a password to change: the password Account Better Auth's change reads. */
async function hasPassword(auth: Auth, userId: string) {
	const { internalAdapter } = await auth.$context;
	return Boolean((await internalAdapter.findCredentialAccount(userId))?.password);
}

/**
 * The account actions: signing in, signing up, changing a password and signing out, with the limits and the
 * refusal codes the forms share. Each form has its own throttle, made here once, in memory in this process:
 * Sign in, Sign up, Accept invite and Change password never share a budget. A route that moves onto these
 * actions drops its own `createThrottle()` and calls the action on `multiUser.accounts`, so the one throttle
 * serves every request; the provider starts are the process's one set, which the auth callback shares.
 */
export function createAccountActions({
	auth,
	providerStarts,
	registrationOpen,
	inviteValid
}: {
	auth: Auth;
	providerStarts: ProviderStarts;
	/** Whether the Registration Mode lets anyone sign up; read on every Sign up. */
	registrationOpen: () => boolean;
	/** Whether the token names an Invite not used, expired or cancelled (`Invites.lookup`); read on every Accept invite. */
	inviteValid: (token: string) => Promise<boolean>;
}): AccountActions {
	const signInThrottle: Throttle = createThrottle();
	const signUpThrottle: Throttle = createThrottle();
	const acceptThrottle: Throttle = createThrottle();
	const changePasswordThrottle: Throttle = createThrottle();

	return {
		providers: () => enabledProviders(auth).map((id) => ({ id, name: SOCIAL_PROVIDER_NAMES[id] })),

		async status(headers) {
			const session = await currentSession(auth, headers);
			if (!session) return null;
			return {
				forced: session.mustChangePassword,
				hasPassword: await hasPassword(auth, session.userId)
			};
		},

		async signIn({ email, password, address }) {
			// The Account Better Auth would sign in: looked up the way it does (`emailKey`), so the Account limits
			// cannot be dodged by how the email is spelled. With none, the email's digest stands in, so an unknown
			// email is limited exactly like a known one. A blank form names nobody.
			let named: Pick<ThrottleInput, 'accountId' | 'unknownEmail'> = { accountId: null };
			if (email !== '') {
				try {
					const { internalAdapter } = await auth.$context;
					const found = await internalAdapter.findUserByEmail(emailKey(email));
					named = found
						? { accountId: found.user.id }
						: { accountId: null, unknownEmail: emailDigest(email) };
				} catch (error) {
					logFailure('Sign in: looking up the account failed:', error);
					return refuse('SIGN_IN_FAILED');
				}
			}

			// Before the password is looked at, so a flood of guesses of any kind is counted and none is free.
			const turn = signInThrottle.attempt({ address, ...named });
			if (!turn.allowed) return refuse('WRONG_SIGN_IN');
			if (email === '' || password === '') return refuse('WRONG_SIGN_IN');

			let headers: Headers;
			try {
				// Only these two fields go on: a client cannot ask for a longer session or a redirect.
				({ headers } = await auth.api.signInEmail({
					body: { email, password },
					returnHeaders: true
				}));
			} catch (error) {
				if (isWrongSignIn(error)) return refuse('WRONG_SIGN_IN');
				logFailure('Sign in: signing in failed:', error);
				return refuse('SIGN_IN_FAILED');
			}
			// A right password takes its own attempt back, so signing in never uses up a shared address's budget.
			signInThrottle.succeed(turn.token);
			return { cookies: headers.getSetCookie() };
		},

		async startProvider({ provider, next, address }) {
			const known = enabledProviders(auth).find((id) => id === provider);
			if (!known) return refuse('PROVIDER_REFUSED');
			const turn = providerStarts.throttle.attempt({ address, accountId: null });
			if (!turn.allowed) return refuse('PROVIDER_REFUSED');
			let target: string;
			let headers: Headers;
			try {
				const started = await auth.api.signInSocial({
					body: { provider: known, callbackURL: next, errorCallbackURL: '/signin' },
					returnHeaders: true
				});
				headers = started.headers;
				target = started.response.url ?? '';
			} catch (error) {
				logFailure('Sign in: starting a provider sign-in failed:', error);
				return refuse('SIGN_IN_FAILED');
			}
			if (!/^https:\/\//.test(target)) return refuse('SIGN_IN_FAILED');
			// The callback gives this start back when it signs someone in, found by the `state` of the authorize URL.
			try {
				const state = new URL(target).searchParams.get('state');
				if (state) providerStarts.record(state, turn.token);
			} catch {
				// No state to key it by: the start stays counted.
			}
			return { cookies: headers.getSetCookie(), location: target };
		},

		async signUp({ fields, address, invite }) {
			const throttle = invite === undefined ? signUpThrottle : acceptThrottle;
			// Before anything else, so a flood of attempts of any kind is counted and none is free.
			const turn = throttle.attempt({ address, accountId: null });
			// After the charge, as the routes read the body: a body that fails to parse is charged and throws.
			const { name: typedName, email: typedEmail, password } = await fields();
			if (!turn.allowed) {
				return {
					...refuse('TOO_MANY_ATTEMPTS'),
					retryAfterSeconds: Math.max(1, Math.ceil(turn.retryAfterMs / 1000))
				};
			}

			// After the charge, so a closed or invalid attempt spends a count like any other. Sign up checks the
			// Registration Mode; Accept invite checks the Invite (the registration gate checks both again).
			if (invite === undefined) {
				if (!registrationOpen()) return refuse('SIGN_UP_CLOSED');
			} else if (!(await inviteValid(invite))) {
				return refuse('INVITE_INVALID');
			}

			const name = typedName.trim();
			const email = typedEmail.trim();
			if (name === '') return refuse('NAME_REQUIRED', 'name');
			if (isNameTooLong(name)) return refuse('NAME_TOO_LONG', 'name');
			if (hasForbiddenNameCharacter(name)) return refuse('NAME_INVALID_CHARACTERS', 'name');
			if (!z.email().safeParse(email).success) return refuse('INVALID_EMAIL', 'email');
			if (password.length < MIN_PASSWORD_LENGTH) return refuse('PASSWORD_TOO_SHORT', 'password');
			if (password.length > MAX_PASSWORD_LENGTH) return refuse('PASSWORD_TOO_LONG', 'password');

			let headers: Headers;
			try {
				// Only these three fields go on: a client cannot add a role, a Learner or anything else. An
				// Invite's token goes as the invite cookie the registration gate reads.
				({ headers } = await auth.api.signUpEmail({
					body: { name, email, password },
					...(invite === undefined
						? {}
						: { headers: new Headers({ cookie: `${INVITE_COOKIE}=${invite}` }) }),
					returnHeaders: true
				}));
			} catch (error) {
				const refusal = refusalOf(error);
				if (refusal) {
					// The gate or the claim said no: for an Invite, it was used, expired or cancelled.
					return invite !== undefined && refusal.refused === 'SIGN_UP_CLOSED'
						? refuse('INVITE_INVALID')
						: refusal;
				}
				logFailure(
					`${invite === undefined ? 'Sign up' : 'Accept invite'}: creating the account failed:`,
					error
				);
				return refuse('SIGN_UP_FAILED');
			}
			return { cookies: headers.getSetCookie() };
		},

		async changePassword({ headers, current, next, confirm, address }) {
			const session = await currentSession(auth, headers);
			if (!session) return refuse('NOT_SIGNED_IN');
			const { userId } = session;
			const forced = session.mustChangePassword;

			// Before anything is counted: an Account with no password has no current password to guess.
			if (!(await hasPassword(auth, userId))) return refuse('NO_PASSWORD');

			// Checks that need no password hash and say nothing about the current password come first,
			// and do not spend the budget.
			if (next.length < MIN_PASSWORD_LENGTH) return refuse('PASSWORD_TOO_SHORT', 'new');
			if (next.length > MAX_PASSWORD_LENGTH) return refuse('PASSWORD_TOO_LONG', 'new');
			if (next !== confirm) return refuse('PASSWORDS_DO_NOT_MATCH', 'confirm');

			// Before the current password is looked at, so a flood of guesses is counted and none is free.
			const turn = changePasswordThrottle.attempt({ address, accountId: userId });
			if (!turn.allowed) return refuse('WRONG_CURRENT_PASSWORD', 'current');
			if (current === '' || current.length > MAX_PASSWORD_LENGTH) {
				return refuse('WRONG_CURRENT_PASSWORD', 'current');
			}
			// Better Auth hashes the NFKC form, so two spellings of one password are the same password.
			if (next.normalize('NFKC') === current.normalize('NFKC')) {
				return refuse('SAME_PASSWORD', 'new');
			}

			let out: Headers;
			try {
				// Only these fields go on, and other sessions are always ended: a client cannot choose.
				({ headers: out } = await auth.api.changePassword({
					headers,
					body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
					returnHeaders: true
				}));
			} catch (failure) {
				if (isAPIError(failure) && failure.statusCode === 401) return refuse('NOT_SIGNED_IN');
				if (isAPIError(failure) && failure.statusCode === 400) {
					return refuse('WRONG_CURRENT_PASSWORD', 'current');
				}
				logFailure('Change password: changing the password failed:', failure);
				// The library's change is separate writes: the credential may be new while other sessions survive,
				// or the caller's own session may be gone. Whichever, no session from before the change survives.
				try {
					const { internalAdapter } = await auth.$context;
					await internalAdapter.deleteUserSessions(userId);
				} catch (cleanup) {
					logFailure('Change password: ending the sessions after a failure failed:', cleanup);
					return refuse('CHANGE_UNENDED');
				}
				return refuse('CHANGE_FAILED');
			}
			// The right current password takes its own attempt back.
			changePasswordThrottle.succeed(turn.token);
			const cookies = out.getSetCookie();

			let flagCleared = true;
			if (forced) {
				try {
					const { internalAdapter } = await auth.$context;
					await internalAdapter.updateUser(userId, { mustChangePassword: false });
				} catch (failure) {
					logFailure('Change password: clearing the must-change flag failed:', failure);
					flagCleared = false;
				}
			}
			return { cookies, forced, flagCleared };
		},

		async signOut({ headers }) {
			try {
				const out = await auth.api.signOut({ headers, returnHeaders: true });
				return { cookies: out.headers.getSetCookie() };
			} catch (failure) {
				logFailure('Sign out failed:', failure);
				// A user who must change their password is held to that page. Whether they must is read afresh; if
				// it cannot be read, or names no session, they are treated as held.
				let held = true;
				try {
					const session = await currentSession(auth, headers);
					held = session === null || session.mustChangePassword;
				} catch {
					held = true;
				}
				return refuse(held ? 'MUST_CHANGE_HOLD' : 'SIGN_OUT_FAILED');
			}
		}
	};
}
