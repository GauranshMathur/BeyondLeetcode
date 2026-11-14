import { type ActionFailure, fail, type RequestEvent } from '@sveltejs/kit';
import {
	ACCOUNT_LIMITS,
	type AccountActions,
	type AccountField,
	type Refusal,
	type RefusalCode
} from './identity/account-actions.js';

/** Fixed texts only: an error's own message (Prisma's carry paths and query text) never reaches the form. */
const MESSAGES = {
	name: 'Enter a name.',
	nameLong: `Use at most ${ACCOUNT_LIMITS.nameMax} characters.`,
	nameCharacters: "This name contains a character that can't be used.",
	email: 'Enter an email address like name@example.com.',
	passwordShort: `Use at least ${ACCOUNT_LIMITS.passwordMin} characters.`,
	passwordLong: `Use at most ${ACCOUNT_LIMITS.passwordMax} characters.`,
	// Deliberately says nothing about why: it must not tell a stranger which emails have Accounts.
	emailUnavailable: 'This email cannot be used. Try a different one.',
	closed: 'Sign-up is closed.',
	invalid: 'This invite link does not work.',
	tooMany: 'Too many attempts. Try again in a few minutes.'
} as const;

/** What the forms say when no code has a text of its own, and when the body cannot be read. */
export const FAILED_MESSAGE = 'The account could not be created. Try again.';

type Status = 400 | 403 | 429 | 500 | 503;
type Typed = { name: string; email: string };

/**
 * The status and text of every refusal code on the Sign up and Accept invite forms. Every code is listed, so
 * a new one fails `bun run check` until it is given an answer or `null` here. `null`: these forms have no
 * text for it (they cannot meet it, or it is a failure), so it answers the generic failure.
 */
export const ACCOUNT_FORM_ANSWERS: Record<
	RefusalCode,
	{ status: 400 | 403 | 429; message: string } | null
> = {
	TOO_MANY_ATTEMPTS: { status: 429, message: MESSAGES.tooMany },
	SIGN_UP_CLOSED: { status: 403, message: MESSAGES.closed },
	// The Invite is not usable, or the gate or the claim said no: used, expired or cancelled.
	INVITE_INVALID: { status: 403, message: MESSAGES.invalid },
	NAME_REQUIRED: { status: 400, message: MESSAGES.name },
	NAME_TOO_LONG: { status: 400, message: MESSAGES.nameLong },
	NAME_INVALID_CHARACTERS: { status: 400, message: MESSAGES.nameCharacters },
	INVALID_EMAIL: { status: 400, message: MESSAGES.email },
	PASSWORD_TOO_SHORT: { status: 400, message: MESSAGES.passwordShort },
	PASSWORD_TOO_LONG: { status: 400, message: MESSAGES.passwordLong },
	EMAIL_UNAVAILABLE: { status: 400, message: MESSAGES.emailUnavailable },
	WRONG_SIGN_IN: null,
	SIGN_IN_FAILED: null,
	PROVIDER_REFUSED: null,
	SIGN_UP_FAILED: null,
	WRONG_CURRENT_PASSWORD: null,
	PASSWORDS_DO_NOT_MATCH: null,
	NO_PASSWORD: null,
	SAME_PASSWORD: null,
	CHANGE_FAILED: null,
	CHANGE_UNENDED: null,
	NOT_SIGNED_IN: null,
	SIGN_OUT_FAILED: null,
	MUST_CHANGE_HOLD: null
};

/** A form value as text: anything but a string (a file, a missing field) is empty. */
export const formText = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
};

/**
 * What the form page gets back from a refused attempt: always the same keys, the typed name and email and
 * never the password. `extra` is a route's own keys (Accept invite's `invalid`).
 */
export function refused<Extra extends object = Record<never, never>>(
	status: Status,
	typed: Typed,
	message: string,
	field?: AccountField,
	extra?: Extra
): ActionFailure<Typed & { field: AccountField | undefined; message: string } & Extra> {
	return fail(status, { ...typed, field, message, ...(extra as Extra) });
}

/** A refusal of a sign-up as the form's answer; a code with no text is the generic failure (500). */
export function answerRefusal<Extra extends object = Record<never, never>>(
	event: Pick<RequestEvent, 'setHeaders'>,
	typed: Typed,
	refusal: Refusal,
	extra?: Extra
) {
	const known = ACCOUNT_FORM_ANSWERS[refusal.refused];
	if (!known) return refused(500, typed, FAILED_MESSAGE, undefined, extra);
	if (refusal.refused === 'TOO_MANY_ATTEMPTS') {
		event.setHeaders({ 'retry-after': String(refusal.retryAfterSeconds ?? 1) });
	}
	return refused(known.status, typed, known.message, refusal.field, extra);
}

/**
 * Reads the form inside `accounts.signUp`, which counts the attempt first. Gives back what was typed (the
 * password never comes back) with the result, or `unreadable` for a body that is not a form: the route
 * answers that with a fixed 400, and nothing of the request is logged. Any other error is the caller's.
 */
export async function signUpFromForm(
	accounts: Pick<AccountActions, 'signUp'>,
	input: { request: Pick<Request, 'formData'>; address: string; invite?: string }
): Promise<
	{ typed: Typed; result: Awaited<ReturnType<AccountActions['signUp']>> } | { unreadable: true }
> {
	let typed: Typed = { name: '', email: '' };
	let unreadable = false;
	try {
		const result = await accounts.signUp({
			fields: async () => {
				let data: FormData;
				try {
					data = await input.request.formData();
				} catch (error) {
					unreadable = true;
					throw error;
				}
				typed = { name: formText(data, 'name'), email: formText(data, 'email') };
				return { ...typed, password: formText(data, 'password') };
			},
			address: input.address,
			...(input.invite === undefined ? {} : { invite: input.invite })
		});
		return { typed, result };
	} catch (error) {
		if (unreadable) return { unreadable: true };
		throw error;
	}
}
