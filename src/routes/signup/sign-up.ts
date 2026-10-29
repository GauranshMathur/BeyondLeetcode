import { fail, type RequestEvent, redirect } from '@sveltejs/kit';
import type { AccountField, Refusal, RefusalCode } from '#lib/server/identity/account-actions.js';
import {
	MAX_NAME_LENGTH,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH
} from '#lib/server/identity/auth.js';
import { forwardSetCookies } from '#lib/server/identity/auth-handler.js';
import { clientAddress } from '#lib/server/identity/client-address.js';

/** Fixed texts only: an error's own message (Prisma's carry paths and query text) never reaches the form. */
const MESSAGES = {
	name: 'Enter a name.',
	nameLong: `Use at most ${MAX_NAME_LENGTH} characters.`,
	nameCharacters: "This name contains a character that can't be used.",
	email: 'Enter an email address like name@example.com.',
	passwordShort: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
	passwordLong: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
	// Deliberately says nothing about why: it must not tell a stranger which emails have Accounts.
	emailUnavailable: 'This email cannot be used. Try a different one.',
	closed: 'Sign-up is closed.',
	tooMany: 'Too many attempts. Try again in a few minutes.',
	failed: 'The account could not be created. Try again.'
} as const;

type SignUpEvent = Pick<
	RequestEvent,
	'request' | 'locals' | 'cookies' | 'getClientAddress' | 'setHeaders'
>;

/** The status and text each refusal of a sign-up gets; any other refusal is a failure. */
const ANSWERS: Partial<Record<RefusalCode, { status: 400 | 403 | 429; message: string }>> = {
	TOO_MANY_ATTEMPTS: { status: 429, message: MESSAGES.tooMany },
	SIGN_UP_CLOSED: { status: 403, message: MESSAGES.closed },
	NAME_REQUIRED: { status: 400, message: MESSAGES.name },
	NAME_TOO_LONG: { status: 400, message: MESSAGES.nameLong },
	NAME_INVALID_CHARACTERS: { status: 400, message: MESSAGES.nameCharacters },
	INVALID_EMAIL: { status: 400, message: MESSAGES.email },
	PASSWORD_TOO_SHORT: { status: 400, message: MESSAGES.passwordShort },
	PASSWORD_TOO_LONG: { status: 400, message: MESSAGES.passwordLong },
	EMAIL_UNAVAILABLE: { status: 400, message: MESSAGES.emailUnavailable }
};

/** What the form page gets back from a refused attempt: always the same keys, never the password. */
const refused = (
	status: 400 | 403 | 429 | 500 | 503,
	typed: { name: string; email: string },
	message: string,
	field?: AccountField
) => fail(status, { ...typed, field, message });

const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
};

/**
 * The Sign up page: whether the form is offered, and the action that creates an Account.
 *
 * The action is `accounts.signUp` of the Multi-user routes' account actions (`account-actions.ts`), which
 * counts every attempt, checks the Registration Mode and the fields, and signs up. This file turns what it
 * answers into the form's fixed texts and statuses.
 */
export function createSignUp() {
	return {
		/** `open` is whether the Registration Mode lets anyone sign up; otherwise the page says it is closed. */
		load({ locals }: Pick<RequestEvent, 'locals'>) {
			// Someone who is signed in has nothing to do here.
			if (locals.identity) redirect(303, '/');
			return {
				open: locals.instance.registrationMode() === 'open',
				minPasswordLength: MIN_PASSWORD_LENGTH
			};
		},

		async action(event: SignUpEvent) {
			const { request, locals, cookies } = event;
			if (locals.identity) redirect(303, '/');

			const accounts = locals.multiUser?.accounts;
			if (!accounts) return refused(503, { name: '', email: '' }, MESSAGES.failed);

			// What was typed comes back, except the password.
			let typed = { name: '', email: '' };
			const result = await accounts.signUp({
				fields: async () => {
					const data = await request.formData();
					typed = { name: text(data, 'name'), email: text(data, 'email') };
					return { ...typed, password: text(data, 'password') };
				},
				address: clientAddress(event)
			});

			if ('refused' in result) return answer(event, typed, result);
			forwardSetCookies(cookies, result.cookies);
			redirect(303, '/');
		}
	};
}

function answer(
	event: Pick<SignUpEvent, 'setHeaders'>,
	typed: { name: string; email: string },
	refusal: Refusal
) {
	const known = ANSWERS[refusal.refused];
	if (!known) return refused(500, typed, MESSAGES.failed);
	if (refusal.refused === 'TOO_MANY_ATTEMPTS') {
		event.setHeaders({ 'retry-after': String(refusal.retryAfterSeconds ?? 1) });
	}
	return refused(known.status, typed, known.message, refusal.field);
}
