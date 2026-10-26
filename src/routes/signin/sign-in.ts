import { createHash } from 'node:crypto';
import { fail, type RequestEvent, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { enabledProviders, SOCIAL_PROVIDER_NAMES } from '#lib/server/identity/auth.js';
import { forwardSetCookies } from '#lib/server/identity/auth-handler.js';
import { clientAddress } from '#lib/server/identity/client-address.js';
import { safeNext } from '#lib/server/identity/gate.js';
import {
	createProviderStarts,
	type ProviderStarts,
	type Throttle,
	type ThrottleInput
} from '#lib/server/identity/throttle.js';

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
 * The limits' stand-in for an email that has no Account: a digest of the normalised email (lowercased like
 * Better Auth's lookup, not trimmed), so the email itself is never held in memory. Known and unknown emails
 * then reach the throttled state on the same schedule; if only known ones did, a throttled refusal (which
 * skips the password hash, so it answers faster) would tell an attacker which emails have an Account. It
 * goes in its own field, not in `accountId`: the throttle keeps these keys, which the client chooses, apart
 * from real Account ids (`throttle.ts`).
 */
const emailDigest = (email: string) =>
	createHash('sha256').update(email.toLowerCase()).digest('hex');

/** The kind of failure only: the error text may hold paths, query text and the input. */
function logFailure(what: string, error: unknown) {
	const code = isAPIError(error) ? error.body?.code : (error as { code?: unknown })?.code;
	console.error(
		`Sign in: ${what}:`,
		error instanceof Error ? error.name : typeof error,
		typeof code === 'string' ? code : undefined
	);
}

/** Better Auth answers 400 to an email or password it will not look at and 401 to a wrong one. */
const isWrongSignIn = (error: unknown) =>
	isAPIError(error) && (error.statusCode === 400 || error.statusCode === 401);

/**
 * Sends the visitor to the provider. Only a provider this Instance has is started, with the one redirect back
 * (`next`, a path on this site) and Sign in as the error page; nothing else of the request goes on, so a client
 * cannot choose its own redirect or sign-up flag. Starting writes the flow's state, so it has its own limit.
 */
async function startProvider(
	event: SignInEvent,
	auth: NonNullable<App.Locals['auth']>,
	provider: string,
	next: string,
	starts: ProviderStarts
) {
	const known = enabledProviders(auth).find((id) => id === provider);
	if (!known) return refused(400, '', MESSAGES.failed);
	const turn = starts.throttle.attempt({ address: clientAddress(event), accountId: null });
	if (!turn.allowed) return refused(400, '', MESSAGES.failed);
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
		logFailure('starting a provider sign-in failed', error);
		return refused(500, '', MESSAGES.failed);
	}
	if (!/^https:\/\//.test(target)) return refused(500, '', MESSAGES.failed);
	// The callback gives this start back when it signs someone in, found by the `state` of the authorize URL.
	try {
		const state = new URL(target).searchParams.get('state');
		if (state) starts.record(state, turn.token);
	} catch {
		// No state to key it by: the start stays counted.
	}
	forwardSetCookies(event.cookies, headers.getSetCookie());
	// SvelteKit 3 refuses an external target unless the call opts in. This one is the provider's authorize URL from
	// Better Auth, checked to be https above; `javascript:` stays blocked either way.
	redirect(303, target, { external: true });
}

/**
 * The Sign in page: whether it links to Sign up, and the action that signs an Account in.
 *
 * Password sign-in is not served over HTTP (see `disabledPaths` in auth.ts), so this action is the one
 * way in with a password, and it carries the limits Better Auth's own limiter cannot: `throttle` counts
 * every attempt against the caller's address and, when the email names an Account, against that Account
 * (`throttle.ts`). Its counters live in memory in this process.
 */
export function createSignIn(throttle: Throttle, starts: ProviderStarts = createProviderStarts()) {
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
				providers: (locals.auth ? enabledProviders(locals.auth) : []).map((id) => ({
					id,
					name: SOCIAL_PROVIDER_NAMES[id]
				})),
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

			const { auth } = locals;
			if (!auth) return refused(503, email, MESSAGES.failed);

			// A provider button posts here too, with its id and no password.
			const provider = text(data, 'provider');
			if (provider !== '') return startProvider(event, auth, provider, next, starts);

			// The Account Better Auth would sign in: looked up the way it does (lowercased, not trimmed), so the
			// Account limits cannot be dodged by how the email is spelled. With none, the email's digest stands
			// in, so an unknown email is limited exactly like a known one. A blank form names nobody.
			let named: Pick<ThrottleInput, 'accountId' | 'unknownEmail'> = { accountId: null };
			if (email !== '') {
				try {
					const { internalAdapter } = await auth.$context;
					const found = await internalAdapter.findUserByEmail(email.toLowerCase());
					named = found
						? { accountId: found.user.id }
						: { accountId: null, unknownEmail: emailDigest(email) };
				} catch (error) {
					logFailure('looking up the account failed', error);
					return refused(500, email, MESSAGES.failed);
				}
			}

			// Before the password is looked at, so a flood of guesses of any kind is counted and none is free.
			const turn = throttle.attempt({ address: clientAddress(event), ...named });
			if (!turn.allowed) return wrongSignIn(email);
			if (email === '' || password === '') return wrongSignIn(email);

			let headers: Headers;
			try {
				// Only these two fields go on: a client cannot ask for a longer session or a redirect.
				({ headers } = await auth.api.signInEmail({
					body: { email, password },
					returnHeaders: true
				}));
			} catch (error) {
				if (isWrongSignIn(error)) return wrongSignIn(email);
				logFailure('signing in failed', error);
				return refused(500, email, MESSAGES.failed);
			}
			// A right password takes its own attempt back, so signing in never uses up a shared address's budget.
			throttle.succeed(turn.token);
			forwardSetCookies(cookies, headers.getSetCookie());
			redirect(303, next);
		}
	};
}
