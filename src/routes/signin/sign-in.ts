import { fail, type RequestEvent, redirect } from '@sveltejs/kit';
import type { Refusal } from '#lib/server/identity/account-actions.js';
import { forwardSetCookies } from '#lib/server/identity/auth-handler.js';
import { clientAddress } from '#lib/server/identity/client-address.js';
import { safeNext } from '#lib/server/identity/gate.js';

/**
 * Fixed texts only: an error's own message (Prisma's carry paths and query text) never reaches the form.
 *
 * `wrong` is the one text for a wrong password, no such Account and too many attempts. The limits count
 * per Account, so a different text for "too many attempts" would tell an attacker which emails have one.
 */
const MESSAGES = {
	wrong: 'Email or password is wrong.',
	failed: 'Signing in failed. Try again.'
} as const;

/**
 * What the Sign in page says when a provider sends the visitor back with `?error=<code>`. Chosen by the code,
 * never built from it or from the provider's own description, so nothing the query holds is ever shown.
 */
const PROVIDER_NOTICES = {
	closed:
		'That sign-in has no account here, and accounts are made by invite. Ask your admin for an invite link.',
	linked:
		'An account with that email already exists here. Sign in with your password; it cannot be linked to a provider.',
	failed: 'Signing in with that account did not work. Try again.'
} as const;

/** The notice for an `error` code a provider callback sent back, or null when there is none. */
export function providerNotice(code: string | null): string | null {
	if (code === null) return null;
	if (code === 'SIGN_UP_CLOSED') return PROVIDER_NOTICES.closed;
	if (code === 'account_not_linked') return PROVIDER_NOTICES.linked;
	return PROVIDER_NOTICES.failed;
}

type SignInEvent = Pick<
	RequestEvent,
	'request' | 'locals' | 'cookies' | 'getClientAddress' | 'url'
>;

/**
 * What the form page gets back from a refused attempt: always the same keys, never the password.
 * `wrong` marks the one message of a wrong sign-in (the page puts it on the fields); a failure is not that.
 */
const refused = (status: 400 | 500 | 503, email: string, message: string, wrong = false) =>
	fail(status, { email, message, wrong });
const wrongSignIn = (email: string) => refused(400, email, MESSAGES.wrong, true);

const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
};

/** Pages a sign-in never returns to: it would land on a form that sends it straight back. */
const AUTH_PAGES = new Set(['/signin', '/signup']);

/**
 * Where a visitor goes once signed in: the page they asked for when `next` is a path on this site (see
 * `safeNext`), otherwise the Map. Never the Sign in or Sign up page.
 */
export function landing(next: string | null): string {
	const target = safeNext(next);
	let pathname: string;
	let encoded: string;
	try {
		// Decoded, because SvelteKit matches `/%73ignin` to the same route as `/signin`.
		pathname = decodeURIComponent(new URL(target, 'http://localhost').pathname);
		// A Location header holds ASCII: whatever else was typed (non-Latin letters, spaces) goes as %XX, so a
		// hand-made `?next=/日本` is a redirect and not a crash. Already-encoded text is left as it is.
		encoded = target.replace(/[^\x21-\x7e]/gu, encodeURIComponent);
	} catch {
		return '/';
	}
	const page = pathname.length > 1 ? pathname.replace(/\/+$/, '').toLowerCase() : pathname;
	return AUTH_PAGES.has(page) ? '/' : encoded;
}

/**
 * The refusal a form shows: the one text for a wrong sign-in, a 400 with the failure text for a provider start
 * refused up front (unknown, over its limit), and a 500 with the same text for every other failure.
 */
function refusedWith(refusal: Refusal, email: string) {
	if (refusal.refused === 'WRONG_SIGN_IN') return wrongSignIn(email);
	if (refusal.refused === 'PROVIDER_REFUSED') return refused(400, email, MESSAGES.failed);
	return refused(500, email, MESSAGES.failed);
}

/**
 * The Sign in page: whether it links to Sign up, and the action that signs an Account in.
 *
 * The sign-in itself (the limits, the Account lookup, Better Auth) is `locals.multiUser.accounts`; this
 * only reads the form, turns each refusal into its fixed text and forwards the cookies it answers.
 */
export function createSignIn() {
	return {
		/**
		 * `open` is whether the Registration Mode lets anyone sign up: only then the page links to Sign up.
		 * `providers` is a button each (none unless both variables of a provider are set), and `notice` the
		 * fixed text for a provider sign-in that came back refused.
		 */
		load({ locals, url }: Pick<RequestEvent, 'locals' | 'url'>) {
			// Someone who is already signed in goes where they were going.
			if (locals.identity) redirect(303, landing(url.searchParams.get('next')));
			return {
				open: locals.instance.registrationMode() === 'open',
				providers: locals.multiUser?.accounts?.providers() ?? [],
				notice: providerNotice(url.searchParams.get('error'))
			};
		},

		async action(event: SignInEvent) {
			const { request, locals, cookies, url } = event;
			const next = landing(url.searchParams.get('next'));
			if (locals.identity) redirect(303, next);

			const data = await request.formData();
			const email = text(data, 'email');
			const password = text(data, 'password');

			const accounts = locals.multiUser?.accounts;
			if (!accounts) return refused(503, email, MESSAGES.failed);
			const address = clientAddress(event);

			// A provider button posts here too, with its id and no password.
			const provider = text(data, 'provider');
			if (provider !== '') {
				const started = await accounts.startProvider({ provider, next, address });
				if ('refused' in started) return refusedWith(started, '');
				forwardSetCookies(cookies, started.cookies);
				// SvelteKit 3 refuses an external target unless the call opts in. This one is the provider's authorize URL
				// from Better Auth, checked to be https by the action; `javascript:` stays blocked either way.
				redirect(303, started.location, { external: true });
			}

			const signedIn = await accounts.signIn({ email, password, address });
			if ('refused' in signedIn) return refusedWith(signedIn, email);
			forwardSetCookies(cookies, signedIn.cookies);
			redirect(303, next);
		}
	};
}
