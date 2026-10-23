import { error, fail, type RequestEvent, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '$lib/server/identity/auth';
import { forwardSetCookies } from '$lib/server/identity/auth-handler';
import type { Throttle } from '$lib/server/identity/throttle';

/**
 * Fixed texts only: an error's own message and the passwords typed never reach the form.
 *
 * `wrong` is the one text for a wrong current password and for too many attempts, as at Sign in: the
 * limits count per Account, so a different text would tell a guesser where the limit is.
 */
const MESSAGES = {
	wrong: 'That is not your current password.',
	short: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
	long: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
	mismatch: 'The two new passwords do not match.',
	same: 'Choose a password different from your current one.',
	failed: 'Changing your password failed. Try again.'
} as const;

type Field = 'current' | 'new' | 'confirm';

type ChangeEvent = Pick<RequestEvent, 'request' | 'locals' | 'cookies' | 'getClientAddress'>;

/** What the form gets back from a refusal: always the same keys, never a password. */
const refused = (status: 400 | 500 | 503, field: Field | null, message: string) =>
	fail(status, { field, message });

const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
};

/** The caller's address, or '' when the server cannot tell: the throttle keeps those in one shared bucket. */
function clientAddress(event: Pick<RequestEvent, 'getClientAddress'>): string {
	try {
		return event.getClientAddress();
	} catch {
		return '';
	}
}

/** The kind of failure only: the error text may hold paths, query text and the input. */
function logFailure(what: string, failure: unknown) {
	const code = isAPIError(failure) ? failure.body?.code : (failure as { code?: unknown })?.code;
	console.error(
		`Change password: ${what}:`,
		failure instanceof Error ? failure.name : typeof failure,
		typeof code === 'string' ? code : undefined
	);
}

/**
 * The Change password page: whether the user must change their password, and the action that does it.
 *
 * Better Auth's `/change-password` over HTTP is limited only by its own limiter, so a stolen session could
 * guess the current password there. This action is the way the app changes a password, and the current
 * password is checked behind `throttle`, which counts every try against the caller's address and the
 * Account (`throttle.ts`; its counters live in this process, apart from Sign in's). The three steps, in
 * order, are the library's change (which also ends every session and starts this one afresh), sending the
 * new session's cookie, and clearing the must-change flag, which the library never touches. If clearing
 * fails the password has changed and the sessions are gone, so the user has the new cookie and the form;
 * submitting again with the new password as the current one (and a different new one) clears the flag.
 */
export function createChangePassword(throttle: Throttle) {
	/** The signed-in Account, from the session cookie; the gate has let only a signed-in user this far. */
	async function who({ request, locals }: Pick<RequestEvent, 'request' | 'locals'>) {
		const { auth } = locals;
		// Local Mode has no accounts and no passwords (the gate answers 404 there; this is a second lock).
		if (!auth) error(404, 'Not found');
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) redirect(303, '/signin');
		const user = session.user as { id: string; mustChangePassword?: boolean | null };
		return { auth, userId: user.id, forced: user.mustChangePassword === true };
	}

	return {
		/**
		 * `forced`: the user signed in with a one-time password, so the page is the forced variant.
		 * `changed` and `unfinished` come back in the address, because a form posted without JavaScript runs the
		 * action and this load in one request, with the cookie from before the change: the session it names is
		 * gone, so the answer is a redirect to a request that carries the new cookie.
		 */
		async load(event: Pick<RequestEvent, 'request' | 'locals' | 'url'>) {
			const { forced } = await who(event);
			const { searchParams } = event.url;
			return {
				forced,
				changed: searchParams.has('changed'),
				unfinished: searchParams.has('unfinished')
			};
		},

		async action(event: ChangeEvent) {
			const { request, cookies } = event;
			const { auth, userId, forced } = await who(event);

			const data = await request.formData();
			const current = text(data, 'current');
			const next = text(data, 'new');
			const confirm = text(data, 'confirm');

			// Checks that need no password hash and say nothing about the current password come first,
			// and do not spend the budget.
			if (next.length < MIN_PASSWORD_LENGTH) return refused(400, 'new', MESSAGES.short);
			if (next.length > MAX_PASSWORD_LENGTH) return refused(400, 'new', MESSAGES.long);
			if (next !== confirm) return refused(400, 'confirm', MESSAGES.mismatch);

			// Before the current password is looked at, so a flood of guesses is counted and none is free.
			const turn = throttle.attempt({ address: clientAddress(event), accountId: userId });
			if (!turn.allowed) return refused(400, 'current', MESSAGES.wrong);
			if (current === '' || current.length > MAX_PASSWORD_LENGTH) {
				return refused(400, 'current', MESSAGES.wrong);
			}
			if (next === current) return refused(400, 'new', MESSAGES.same);

			let headers: Headers;
			try {
				// Only these fields go on, and other sessions are always ended: a client cannot choose.
				({ headers } = await auth.api.changePassword({
					headers: request.headers,
					body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
					returnHeaders: true
				}));
			} catch (failure) {
				if (isAPIError(failure) && failure.statusCode === 401) redirect(303, '/signin');
				if (isAPIError(failure) && failure.statusCode === 400) {
					return refused(400, 'current', MESSAGES.wrong);
				}
				logFailure('changing the password failed', failure);
				return refused(500, null, MESSAGES.failed);
			}
			// The right current password takes its own attempt back.
			throttle.succeed(turn.token);
			// Every earlier session, this one included, is gone: the new cookie goes out whatever happens next.
			forwardSetCookies(cookies, headers.getSetCookie());

			if (forced) {
				try {
					const { internalAdapter } = await auth.$context;
					await internalAdapter.updateUser(userId, { mustChangePassword: false });
				} catch (failure) {
					logFailure('clearing the must-change flag failed', failure);
					// The load of this request would read the old cookie, so the page is asked for afresh.
					redirect(303, '/account/password?unfinished');
				}
				redirect(303, '/');
			}
			redirect(303, '/account/password?changed');
		}
	};
}
