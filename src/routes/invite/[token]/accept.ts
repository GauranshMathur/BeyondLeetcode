import { type RequestEvent, redirect } from '@sveltejs/kit';
import {
	answerRefusal,
	FAILED_MESSAGE,
	refused,
	signUpFromForm
} from '#lib/server/account-forms.js';
import { ACCOUNT_LIMITS } from '#lib/server/identity/account-actions.js';
import { forwardSetCookies } from '#lib/server/identity/auth-handler.js';
import { clientAddress } from '#lib/server/identity/client-address.js';
import { INVITE_COOKIE, INVITE_COOKIE_PATH } from '#lib/server/identity/invites.js';

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

/** An answer with no refusal code behind it (no account actions, an unreadable body): the Invite is not at fault. */
const inviteNotAtFault = (status: 400 | 503) =>
	refused(status, { name: '', email: '' }, FAILED_MESSAGE, undefined, { invalid: false });

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
				return { valid: false, minPasswordLength: ACCOUNT_LIMITS.passwordMin };
			}
			cookies.set(INVITE_COOKIE, params.token ?? '', {
				path: COOKIE_PATH,
				httpOnly: true,
				sameSite: 'lax',
				secure: secure({ url }),
				maxAge: COOKIE_MAX_AGE_SECONDS
			});
			return { valid: true, minPasswordLength: ACCOUNT_LIMITS.passwordMin };
		},

		async action(event: AcceptEvent) {
			const { request, locals, cookies, params } = event;
			if (locals.identity) redirect(303, '/');

			const accounts = locals.multiUser?.accounts;
			if (!accounts) return inviteNotAtFault(503);

			const outcome = await signUpFromForm(accounts, {
				request,
				address: clientAddress(event),
				// The token is the one in this page's URL, handed over as the invite cookie the gate reads.
				invite: params.token ?? ''
			});
			// A body that is not a form: a fixed answer, and nothing of the request is logged.
			if ('unreadable' in outcome) return inviteNotAtFault(400);

			const { typed, result } = outcome;
			if ('refused' in result) {
				return answerRefusal(event, typed, result, {
					invalid: result.refused === 'INVITE_INVALID'
				});
			}
			forwardSetCookies(cookies, result.cookies);
			forget(cookies, secure(event));
			redirect(303, '/');
		}
	};
}
