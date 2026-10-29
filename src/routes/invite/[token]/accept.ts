import { fail, type RequestEvent, redirect } from '@sveltejs/kit';
import type { AccountField, Refusal, RefusalCode } from '#lib/server/identity/account-actions.js';
import {
	MAX_NAME_LENGTH,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH
} from '#lib/server/identity/auth.js';
import { forwardSetCookies } from '#lib/server/identity/auth-handler.js';
import { clientAddress } from '#lib/server/identity/client-address.js';
import { INVITE_COOKIE, INVITE_COOKIE_PATH } from '#lib/server/identity/invites.js';

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

/** The status and text each refusal of an accept gets; any other refusal is a failure. */
const ANSWERS: Partial<
	Record<RefusalCode, { status: 400 | 403 | 429; message: string; invalid?: boolean }>
> = {
	TOO_MANY_ATTEMPTS: { status: 429, message: MESSAGES.tooMany },
	// The Invite is not usable, or the gate or the claim said no: used, expired or cancelled.
	INVITE_INVALID: { status: 403, message: MESSAGES.invalid, invalid: true },
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
	options: { field?: AccountField; invalid?: boolean } = {}
) => fail(status, { ...typed, field: options.field, invalid: options.invalid === true, message });

const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
};

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
export function createAccept() {
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
			const invite = await locals.multiUser?.invites.lookup(params.token ?? '', new Date());
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

			const accounts = locals.multiUser?.accounts;
			if (!accounts) return refused(503, { name: '', email: '' }, MESSAGES.failed);

			// What was typed comes back, except the password.
			let typed = { name: '', email: '' };
			let unreadable = false;
			let result: Awaited<ReturnType<typeof accounts.signUp>>;
			try {
				result = await accounts.signUp({
					fields: async () => {
						let data: FormData;
						try {
							data = await request.formData();
						} catch (error) {
							unreadable = true;
							throw error;
						}
						typed = { name: text(data, 'name'), email: text(data, 'email') };
						return { ...typed, password: text(data, 'password') };
					},
					address: clientAddress(event),
					// The token is the one in this page's URL, handed over as the invite cookie the gate reads.
					invite: params.token ?? ''
				});
			} catch (error) {
				// A body that is not a form: a fixed answer, and nothing of the request is logged.
				if (unreadable) return refused(400, { name: '', email: '' }, MESSAGES.failed);
				throw error;
			}

			if ('refused' in result) return answer(event, typed, result);
			forwardSetCookies(cookies, result.cookies);
			forget(cookies, secure(event));
			redirect(303, '/');
		}
	};
}

function answer(
	event: Pick<AcceptEvent, 'setHeaders'>,
	typed: { name: string; email: string },
	refusal: Refusal
) {
	const known = ANSWERS[refusal.refused];
	if (!known) return refused(500, typed, MESSAGES.failed);
	if (refusal.refused === 'TOO_MANY_ATTEMPTS') {
		event.setHeaders({ 'retry-after': String(refusal.retryAfterSeconds ?? 1) });
	}
	return refused(known.status, typed, known.message, {
		field: refusal.field,
		invalid: known.invalid
	});
}
