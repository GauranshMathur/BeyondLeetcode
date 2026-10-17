import { fail, type RequestEvent, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { z } from 'zod';
import {
	hasForbiddenNameCharacter,
	isNameTooLong,
	MAX_NAME_LENGTH,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH
} from '$lib/server/identity/auth';
import { forwardSetCookies } from '$lib/server/identity/auth-handler';
import type { Throttle } from '$lib/server/identity/throttle';

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

type Field = 'name' | 'email' | 'password';
type SignUpEvent = Pick<
	RequestEvent,
	'request' | 'locals' | 'cookies' | 'getClientAddress' | 'setHeaders'
>;

/** What the form page gets back from a refused attempt: always the same keys, never the password. */
const refused = (
	status: 400 | 403 | 429 | 500 | 503,
	typed: { name: string; email: string },
	message: string,
	field?: Field
) => fail(status, { ...typed, field, message });

const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
};

/** The Better Auth refusals this form maps to a fixed text; anything else is a failure. */
function known(error: unknown): { status: 400 | 403; field?: Field; message: string } | null {
	if (!isAPIError(error)) return null;
	if (error.statusCode === 403) return { status: 403, message: MESSAGES.closed };
	switch (error.body?.code) {
		case 'USER_ALREADY_EXISTS':
		case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
			return { status: 400, field: 'email', message: MESSAGES.emailUnavailable };
		case 'NAME_REQUIRED':
			return { status: 400, field: 'name', message: MESSAGES.name };
		case 'NAME_TOO_LONG':
			return { status: 400, field: 'name', message: MESSAGES.nameLong };
		case 'NAME_INVALID_CHARACTERS':
			return { status: 400, field: 'name', message: MESSAGES.nameCharacters };
		case 'INVALID_EMAIL':
			return { status: 400, field: 'email', message: MESSAGES.email };
		case 'PASSWORD_TOO_SHORT':
			return { status: 400, field: 'password', message: MESSAGES.passwordShort };
		case 'PASSWORD_TOO_LONG':
			return { status: 400, field: 'password', message: MESSAGES.passwordLong };
		default:
			return null;
	}
}

/** The caller's address, or '' when the server cannot tell: the throttle keeps those in one shared bucket. */
function clientAddress(event: Pick<RequestEvent, 'getClientAddress'>): string {
	try {
		return event.getClientAddress();
	} catch {
		return '';
	}
}

/**
 * The Sign up page: whether the form is offered, and the action that creates an Account.
 *
 * `throttle` counts every attempt against the caller's address (no Account is named, so only the
 * address limit applies), because Better Auth's own limiter does not see these server-side calls. Its
 * counters live in memory in this process, as `throttle.ts` says.
 *
 * Who may sign up is Better Auth's registration hook (`registration.ts`), asked on every sign-up;
 * the Registration Mode check here only saves a request and picks the message.
 */
export function createSignUp(throttle: Throttle) {
	return {
		/** `open` is whether the Registration Mode lets anyone sign up; otherwise the page says it is closed. */
		load({ locals }: Pick<RequestEvent, 'locals'>) {
			// Someone who is signed in has nothing to do here.
			if (locals.identity) redirect(303, '/');
			return { open: locals.instance.registrationMode() === 'open' };
		},

		async action(event: SignUpEvent) {
			const { request, locals, cookies } = event;
			if (locals.identity) redirect(303, '/');

			// Before anything else, so a flood of attempts of any kind is counted and none is free.
			const turn = throttle.attempt({ address: clientAddress(event), accountId: null });

			const data = await request.formData();
			// What was typed comes back, except the password.
			const typed = { name: text(data, 'name'), email: text(data, 'email') };
			if (!turn.allowed) {
				event.setHeaders({
					'retry-after': String(Math.max(1, Math.ceil(turn.retryAfterMs / 1000)))
				});
				return refused(429, typed, MESSAGES.tooMany);
			}

			const { auth } = locals;
			if (!auth) return refused(503, typed, MESSAGES.failed);
			if (locals.instance.registrationMode() !== 'open') {
				return refused(403, typed, MESSAGES.closed);
			}

			const name = typed.name.trim();
			const email = typed.email.trim();
			const password = text(data, 'password');
			if (name === '') return refused(400, typed, MESSAGES.name, 'name');
			if (isNameTooLong(name)) return refused(400, typed, MESSAGES.nameLong, 'name');
			if (hasForbiddenNameCharacter(name)) {
				return refused(400, typed, MESSAGES.nameCharacters, 'name');
			}
			if (!z.email().safeParse(email).success) return refused(400, typed, MESSAGES.email, 'email');
			if (password.length < MIN_PASSWORD_LENGTH) {
				return refused(400, typed, MESSAGES.passwordShort, 'password');
			}
			if (password.length > MAX_PASSWORD_LENGTH) {
				return refused(400, typed, MESSAGES.passwordLong, 'password');
			}

			let headers: Headers;
			try {
				// Only these three fields go on: a client cannot add a role, a Learner or anything else.
				({ headers } = await auth.api.signUpEmail({
					body: { name, email, password },
					returnHeaders: true
				}));
			} catch (error) {
				const refusal = known(error);
				if (refusal) return refused(refusal.status, typed, refusal.message, refusal.field);
				// Only the kind of failure is logged: the error text may hold paths, query text and the input.
				const code = isAPIError(error) ? error.body?.code : (error as { code?: unknown })?.code;
				console.error(
					'Sign up: creating the account failed:',
					error instanceof Error ? error.name : typeof error,
					typeof code === 'string' ? code : undefined
				);
				return refused(500, typed, MESSAGES.failed);
			}
			forwardSetCookies(cookies, headers.getSetCookie());
			redirect(303, '/');
		}
	};
}
