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

type SignUpEvent = Pick<
	RequestEvent,
	'request' | 'locals' | 'cookies' | 'getClientAddress' | 'setHeaders'
>;

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
				minPasswordLength: ACCOUNT_LIMITS.passwordMin
			};
		},

		async action(event: SignUpEvent) {
			const { request, locals, cookies } = event;
			if (locals.identity) redirect(303, '/');

			const accounts = locals.multiUser?.accounts;
			if (!accounts) return refused(503, { name: '', email: '' }, FAILED_MESSAGE);

			const outcome = await signUpFromForm(accounts, {
				request,
				address: clientAddress(event)
			});
			// A body that is not a form: a fixed answer, the same as Accept invite gives.
			if ('unreadable' in outcome) return refused(400, { name: '', email: '' }, FAILED_MESSAGE);

			if ('refused' in outcome.result) {
				return answerRefusal(event, outcome.typed, outcome.result);
			}
			forwardSetCookies(cookies, outcome.result.cookies);
			redirect(303, '/');
		}
	};
}
