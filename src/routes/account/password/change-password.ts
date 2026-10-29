import { error, fail, type RequestEvent, redirect } from '@sveltejs/kit';
import type { RefusalCode } from '#lib/server/identity/account-actions.js';
import { ACCOUNT_LIMITS } from '#lib/server/identity/account-actions.js';
import { MIN_PASSWORD_LENGTH } from '#lib/server/identity/auth.js';
import { forwardSetCookies } from '#lib/server/identity/auth-handler.js';
import { clientAddress } from '#lib/server/identity/client-address.js';

/**
 * Fixed texts only: an error's own message and the passwords typed never reach the form.
 *
 * `wrong` is the one text for a wrong current password and for too many attempts, as at Sign in: the
 * limits count per Account, so a different text would tell a guesser where the limit is.
 */
const MESSAGES = {
	wrong: 'That is not your current password.',
	short: `Use at least ${ACCOUNT_LIMITS.passwordMin} characters.`,
	long: `Use at most ${ACCOUNT_LIMITS.passwordMax} characters.`,
	mismatch: 'The two new passwords do not match.',
	// Said plainly: the caller is signed in as this Account, so it tells them nothing they may not know.
	noPassword:
		'Your Account has no password: you sign in with GitHub or Google. There is nothing to change here.',
	same: 'Choose a password different from your current one.',
	failed:
		'Changing your password failed, and it may have changed. You are signed out of every session. Sign in with your new password, or your old one if that fails.',
	// Ending the sessions failed too: say so, or the user would think every other device is signed out.
	unended:
		'Changing your password failed, and it may have changed. Other sessions may still be signed in. Sign in with your new password, or your old one if that fails, then change your password again.'
} as const;

type Field = 'current' | 'new' | 'confirm';

type ChangeEvent = Pick<RequestEvent, 'request' | 'locals' | 'cookies' | 'getClientAddress'>;

/** What the form gets back from a refusal: always the same keys, never a password. */
const refused = (status: 400 | 500, field: Field | null, message: string) =>
	fail(status, { field, message });

/** Each refusal the account actions' change answers, as the form shows it. */
const FORM: Partial<Record<RefusalCode, [400 | 500, Field | null, string]>> = {
	WRONG_CURRENT_PASSWORD: [400, 'current', MESSAGES.wrong],
	PASSWORD_TOO_SHORT: [400, 'new', MESSAGES.short],
	PASSWORD_TOO_LONG: [400, 'new', MESSAGES.long],
	PASSWORDS_DO_NOT_MATCH: [400, 'confirm', MESSAGES.mismatch],
	NO_PASSWORD: [400, null, MESSAGES.noPassword],
	SAME_PASSWORD: [400, 'new', MESSAGES.same],
	CHANGE_UNENDED: [500, null, MESSAGES.unended]
};

const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
};

/**
 * The Change password page: whether the user must change their password, and the action that does it.
 *
 * The throttle on the current password, the Better Auth calls, ending the sessions after a failure and
 * clearing the must-change flag are the account actions' (`accounts.changePassword`); this keeps the texts, the
 * fields and the redirects. If clearing the flag fails the password has changed and the sessions are gone, so
 * the user has the new cookie and the form; submitting again with the new password as the current one (and a
 * different new one) clears the flag.
 */
export function createChangePassword() {
	/** The account actions; Local Mode has none (the gate answers 404 there; this is a second lock). */
	function actionsOf({ locals }: Pick<RequestEvent, 'locals'>) {
		const accounts = locals.multiUser?.accounts;
		if (!accounts) error(404, 'Not found');
		return accounts;
	}

	return {
		/**
		 * `forced`: the user signed in with a one-time password, so the page is the forced variant.
		 * `changed` and `unfinished` come back in the address, because a form posted without JavaScript runs the
		 * action and this load in one request, with the cookie from before the change: the session it names is
		 * gone, so the answer is a redirect to a request that carries the new cookie.
		 */
		async load(event: Pick<RequestEvent, 'request' | 'locals' | 'url'>) {
			const accounts = actionsOf(event);
			const status = await accounts.status(event.request.headers);
			if (!status) {
				// A no-JavaScript post whose failure ended every session loads with a cookie that names none: the
				// page is shown with the failure and a link to Sign in, not a redirect that would hide it.
				if (event.request.method === 'POST')
					return {
						forced: false,
						changed: false,
						unfinished: false,
						signedOut: true,
						minPasswordLength: MIN_PASSWORD_LENGTH
					};
				redirect(303, '/signin');
			}
			const { searchParams } = event.url;
			return {
				forced: status.forced,
				changed: searchParams.has('changed'),
				unfinished: searchParams.has('unfinished'),
				signedOut: false,
				minPasswordLength: MIN_PASSWORD_LENGTH
			};
		},

		async action(event: ChangeEvent) {
			const { request, cookies } = event;
			const accounts = actionsOf(event);
			const status = await accounts.status(request.headers);
			if (!status) redirect(303, '/signin');

			// Before the body is read or anything is counted: an Account with no password has no current
			// password to guess.
			if (!status.hasPassword) return refused(400, null, MESSAGES.noPassword);

			const data = await request.formData();
			const result = await accounts.changePassword({
				headers: request.headers,
				current: text(data, 'current'),
				next: text(data, 'new'),
				confirm: text(data, 'confirm'),
				address: clientAddress(event)
			});

			if ('refused' in result) {
				if (result.refused === 'NOT_SIGNED_IN') redirect(303, '/signin');
				const form = FORM[result.refused];
				return form ? refused(...form) : refused(500, null, MESSAGES.failed);
			}
			// Every earlier session, this one included, is gone: the new cookie goes out whatever happens next.
			forwardSetCookies(cookies, result.cookies);

			if (result.forced) {
				// The load of this request would read the old cookie, so the page is asked for afresh.
				if (!result.flagCleared) redirect(303, '/account/password?unfinished');
				redirect(303, '/');
			}
			redirect(303, '/account/password?changed');
		}
	};
}
