import { fail, type RequestEvent, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { z } from 'zod';
import {
	hasForbiddenNameCharacter,
	INVITE_COOKIE,
	INVITE_COOKIE_PATH,
	isNameTooLong,
	MAX_NAME_LENGTH,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH
} from '#lib/server/identity/auth.js';
import { forwardSetCookies } from '#lib/server/identity/auth-handler.js';
import { clientAddress } from '#lib/server/identity/client-address.js';
import type { Throttle } from '#lib/server/identity/throttle.js';

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
	invalid: 'This invite link does not work.',
	tooMany: 'Too many attempts. Try again in a few minutes.',
	failed: 'The account could not be created. Try again.'
} as const;

type Field = 'name' | 'email' | 'password';
type AcceptEvent = Pick<
	RequestEvent,
	'request' | 'locals' | 'cookies' | 'params' | 'url' | 'getClientAddress' | 'setHeaders'
>;

/** How long the browser keeps the invite cookie: long enough to fill in the form, then it is gone. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60;

/**
 * Where the browser sends the invite cookie: the auth endpoints, because that is where the registration gate
 * reads it, both for the email form's own call and for a provider's redirect back (`/api/auth/callback/*`),
 * which is how an OAuth sign-up through an Invite proves it. The invite pages themselves no longer receive it
 * (they have the token in their address). No other page the browser requests carries the token.
 */
const COOKIE_PATH = INVITE_COOKIE_PATH;

/** Where earlier versions set it. Cleared wherever the cookie is, so a leftover one cannot linger. */
const OLD_COOKIE_PATH = '/invite';

/**
 * `secure` is stated outright: SvelteKit defaults it to true on any host but localhost, and a browser drops
 * a Secure cookie (a clear included) that arrives over plain http.
 */
function forget(cookies: Pick<RequestEvent['cookies'], 'delete'>, secure: boolean) {
	cookies.delete(INVITE_COOKIE, { path: COOKIE_PATH, secure });
	cookies.delete(INVITE_COOKIE, { path: OLD_COOKIE_PATH, secure });
}

/** What the form page gets back from a refused attempt: always the same keys, never the password. */
const refused = (
	status: 400 | 403 | 429 | 500 | 503,
	typed: { name: string; email: string },
	message: string,
	options: { field?: Field; invalid?: boolean } = {}
) => fail(status, { ...typed, field: options.field, invalid: options.invalid === true, message });

const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
};

/** The Better Auth refusals this form maps to a fixed text; anything else is a failure. */
function known(
	error: unknown
): { status: 400 | 403; field?: Field; invalid?: boolean; message: string } | null {
	if (!isAPIError(error)) return null;
	// The gate or the claim said no: the Invite was used, expired or cancelled (or the sign-up is closed).
	if (error.statusCode === 403) return { status: 403, invalid: true, message: MESSAGES.invalid };
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

/**
 * The Accept invite page. The token is in the URL path, so nothing here logs the path or the token, and
 * `handle.ts` answers this route with `Referrer-Policy: strict-origin` and `Cache-Control: no-store`
 * (once, there: a route that sets a header in both its load and its action makes SvelteKit throw on a
 * form post without JavaScript).
 *
 * `load` only checks the Invite (`lookup`) and puts the token in an httpOnly cookie. `action` signs up
 * through Better Auth with that token as the invite cookie of the call; the registration gate checks it
 * and Better Auth's `user.create.before` hook claims it, atomically (`Invites.claim`). Nothing here spends it.
 */
export function createAccept(throttle: Throttle) {
	const secure = (event: Pick<RequestEvent, 'url'>) => event.url.protocol === 'https:';
	return {
		async load({
			locals,
			params,
			cookies,
			url
		}: Pick<RequestEvent, 'locals' | 'params' | 'cookies' | 'url'>) {
			// Someone who is signed in has nothing to accept.
			if (locals.identity) redirect(303, '/');
			const invite = await locals.invites?.lookup(params.token ?? '', new Date());
			if (!invite) {
				forget(cookies, secure({ url }));
				return { valid: false, minPasswordLength: MIN_PASSWORD_LENGTH };
			}
			cookies.set(INVITE_COOKIE, params.token ?? '', {
				path: COOKIE_PATH,
				httpOnly: true,
				sameSite: 'lax',
				secure: secure({ url }),
				maxAge: COOKIE_MAX_AGE_SECONDS
			});
			return { valid: true, minPasswordLength: MIN_PASSWORD_LENGTH };
		},

		async action(event: AcceptEvent) {
			const { request, locals, cookies, params } = event;
			if (locals.identity) redirect(303, '/');

			// Before anything else, so a flood of attempts of any kind is counted and none is free.
			const turn = throttle.attempt({ address: clientAddress(event), accountId: null });

			let data: FormData;
			try {
				data = await request.formData();
			} catch {
				// A body that is not a form: a fixed answer, and nothing of the request is logged.
				return refused(400, { name: '', email: '' }, MESSAGES.failed);
			}
			// What was typed comes back, except the password.
			const typed = { name: text(data, 'name'), email: text(data, 'email') };
			if (!turn.allowed) {
				event.setHeaders({
					'retry-after': String(Math.max(1, Math.ceil(turn.retryAfterMs / 1000)))
				});
				return refused(429, typed, MESSAGES.tooMany);
			}

			const { auth, invites } = locals;
			if (!auth || !invites) return refused(503, typed, MESSAGES.failed);
			const token = params.token ?? '';
			if (!(await invites.lookup(token, new Date()))) {
				return refused(403, typed, MESSAGES.invalid, { invalid: true });
			}

			const name = typed.name.trim();
			const email = typed.email.trim();
			const password = text(data, 'password');
			if (name === '') return refused(400, typed, MESSAGES.name, { field: 'name' });
			if (isNameTooLong(name)) return refused(400, typed, MESSAGES.nameLong, { field: 'name' });
			if (hasForbiddenNameCharacter(name)) {
				return refused(400, typed, MESSAGES.nameCharacters, { field: 'name' });
			}
			if (!z.email().safeParse(email).success) {
				return refused(400, typed, MESSAGES.email, { field: 'email' });
			}
			if (password.length < MIN_PASSWORD_LENGTH) {
				return refused(400, typed, MESSAGES.passwordShort, { field: 'password' });
			}
			if (password.length > MAX_PASSWORD_LENGTH) {
				return refused(400, typed, MESSAGES.passwordLong, { field: 'password' });
			}

			let headers: Headers;
			try {
				// Only these three fields go on: a client cannot add a role, a Learner or anything else. The
				// token is the one in this page's URL, handed over as the invite cookie the gate reads.
				({ headers } = await auth.api.signUpEmail({
					body: { name, email, password },
					headers: new Headers({ cookie: `${INVITE_COOKIE}=${token}` }),
					returnHeaders: true
				}));
			} catch (error) {
				const refusal = known(error);
				if (refusal) {
					return refused(refusal.status, typed, refusal.message, {
						field: refusal.field,
						invalid: refusal.invalid
					});
				}
				// Only the kind of failure is logged: the error text may hold paths, query text and the input.
				const code = isAPIError(error) ? error.body?.code : (error as { code?: unknown })?.code;
				console.error(
					'Accept invite: creating the account failed:',
					error instanceof Error ? error.name : typeof error,
					typeof code === 'string' ? code : undefined
				);
				return refused(500, typed, MESSAGES.failed);
			}
			forwardSetCookies(cookies, headers.getSetCookie());
			forget(cookies, secure(event));
			redirect(303, '/');
		}
	};
}
