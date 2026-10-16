import { fail, type RequestEvent, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { forwardSetCookies } from '$lib/server/identity/auth-handler';
import { safeNext } from '$lib/server/identity/gate';
import type { Throttle } from '$lib/server/identity/throttle';

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

type SignInEvent = Pick<
	RequestEvent,
	'request' | 'locals' | 'cookies' | 'getClientAddress' | 'url'
>;

/** What the form page gets back from a refused attempt: always the same keys, never the password. */
const refused = (status: 400 | 500 | 503, email: string, message: string) =>
	fail(status, { email, message });

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
	try {
		// Decoded, because SvelteKit matches `/%73ignin` to the same route as `/signin`.
		pathname = decodeURIComponent(new URL(target, 'http://localhost').pathname);
	} catch {
		return '/';
	}
	const page = pathname.length > 1 ? pathname.replace(/\/+$/, '').toLowerCase() : pathname;
	return AUTH_PAGES.has(page) ? '/' : target;
}

/** The caller's address, or '' when the server cannot tell: the throttle keeps those in one shared bucket. */
function clientAddress(event: Pick<RequestEvent, 'getClientAddress'>): string {
	try {
		return event.getClientAddress();
	} catch {
		return '';
	}
}

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
 * The Sign in page: whether it links to Sign up, and the action that signs an Account in.
 *
 * Password sign-in is not served over HTTP (see `disabledPaths` in auth.ts), so this action is the one
 * way in with a password, and it carries the limits Better Auth's own limiter cannot: `throttle` counts
 * every attempt against the caller's address and, when the email names an Account, against that Account
 * (`throttle.ts`). Its counters live in memory in this process.
 */
export function createSignIn(throttle: Throttle) {
	return {
		/** `open` is whether the Registration Mode lets anyone sign up: only then the page links to Sign up. */
		load({ locals, url }: Pick<RequestEvent, 'locals' | 'url'>) {
			// Someone who is already signed in goes where they were going.
			if (locals.identity) redirect(303, landing(url.searchParams.get('next')));
			return { open: locals.instance.registrationMode() === 'open' };
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

			// The Account Better Auth would sign in: looked up the way it does (lowercased, not trimmed), so the
			// Account limits cannot be dodged by how the email is spelled. Null when there is none.
			let accountId: string | null = null;
			if (email !== '') {
				try {
					const { internalAdapter } = await auth.$context;
					accountId = (await internalAdapter.findUserByEmail(email.toLowerCase()))?.user.id ?? null;
				} catch (error) {
					logFailure('looking up the account failed', error);
					return refused(500, email, MESSAGES.failed);
				}
			}

			// Before the password is looked at, so a flood of guesses of any kind is counted and none is free.
			const input = { address: clientAddress(event), accountId };
			if (!throttle.attempt(input).allowed) return refused(400, email, MESSAGES.wrong);
			if (email === '' || password === '') return refused(400, email, MESSAGES.wrong);

			let headers: Headers;
			try {
				// Only these two fields go on: a client cannot ask for a longer session or a redirect.
				({ headers } = await auth.api.signInEmail({
					body: { email, password },
					returnHeaders: true
				}));
			} catch (error) {
				if (isWrongSignIn(error)) return refused(400, email, MESSAGES.wrong);
				logFailure('signing in failed', error);
				return refused(500, email, MESSAGES.failed);
			}
			// A right password takes its own attempt back, so signing in never uses up a shared address's budget.
			throttle.succeed(input);
			forwardSetCookies(cookies, headers.getSetCookie());
			redirect(303, next);
		}
	};
}
