import { error, fail } from '@sveltejs/kit';
import { type AdminRefusalCode, isAdminRefusal } from '#lib/server/identity/accounts.js';
import { isRegistrationMode } from '#lib/server/instance.js';
import { logFailure } from '#lib/server/logging.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * The status of a refusal no action has a text for. The Admin actions refuse a non-admin once, with a code;
 * this is where that code becomes a status. A code an action cannot get is a bug, so it is a 500.
 */
function refused(code: AdminRefusalCode): never {
	if (code === 'NOT_ADMIN') error(403, 'Forbidden');
	if (code === 'REGISTRATION_UNAVAILABLE') error(404, 'Not found');
	throw new Error(`The Admin actions refused with ${code}, which this action never asks for.`);
}

/**
 * Every Account, for the admin, and the Registration Mode they can switch. The hook's gate has
 * already sent a signed-out visitor to Sign in, given a learner 403 and hidden the page in Local
 * Mode (404); the Admin actions check the role again and refuse a learner before they read anything.
 */
export const load: PageServerLoad = async ({ locals, request, url }) => {
	const { multiUser, identity } = locals;
	// Set only in Multi-user Mode: Local Mode has no Accounts, whatever role it gives the Local Learner.
	if (!multiUser) error(404, 'Not found');
	if (!identity) error(403, 'Forbidden');
	const { adminActions } = multiUser;
	const accounts = await adminActions.listAccounts({ who: identity, headers: request.headers });
	if (isAdminRefusal(accounts)) refused(accounts.refused);
	const pending = await adminActions.pendingInvites({ who: identity, now: new Date() });
	if (isAdminRefusal(pending)) refused(pending.refused);
	// "Remove" is a plain GET that opens the confirm under the row, so it works without JavaScript. Only
	// another Account's row has one; anything else (an unknown id, your own) opens nothing.
	const asked = url.searchParams.get('remove');
	const confirmingRemove = accounts.some((a) => a.id === asked && !a.you) ? asked : null;
	return {
		accounts,
		pending,
		registration: locals.instance.registrationMode(),
		confirmingRemove
	};
};

export const actions: Actions = {
	/**
	 * Switches who may create an Account. It decides who can, so the Admin actions check the role
	 * first: `admin` exactly (not merely a role that contains it). The gate has already judged the
	 * request; this does not rely on it. Cross-site posts are refused by SvelteKit's origin check on
	 * form actions.
	 */
	registration: async ({ locals, request }) => {
		const { multiUser, identity } = locals;
		if (!identity) error(403, 'Forbidden');
		// Local Mode has no Accounts to register, whatever role it gives the Local Learner.
		if (!multiUser) error(404, 'Not found');

		const choice = (await request.formData()).get('registration');
		if (!isRegistrationMode(choice)) {
			return fail(400, { message: 'Choose invite only or open.' });
		}
		let set: Awaited<ReturnType<typeof multiUser.adminActions.setRegistrationMode>>;
		try {
			// Writes the database, then memory: the next sign-up sees it, with no restart.
			set = await multiUser.adminActions.setRegistrationMode({ who: identity, mode: choice });
		} catch (thrown) {
			// Only the kind of failure is logged (logFailure): an error's text may hold paths and query text.
			logFailure('users: switch registration mode', thrown);
			return fail(500, { message: 'Registration could not be changed. Try again.' });
		}
		if (isAdminRefusal(set)) refused(set.refused);
		return { registration: choice };
	},

	/**
	 * Makes an Invite and answers with its link: the one response that ever carries the token. It is
	 * never cached (the hook sets `no-store` on every /users response), never put in a redirect, and not stored (only its hash is). Admin only, checked first.
	 */
	invite: async ({ locals }) => {
		const { identity, multiUser } = locals;
		if (!identity) error(403, 'Forbidden');
		if (!multiUser) error(404, 'Not found');
		let made: Awaited<ReturnType<typeof multiUser.adminActions.createInvite>>;
		try {
			made = await multiUser.adminActions.createInvite({ who: identity, now: new Date() });
		} catch (thrown) {
			logFailure('users: create invite', thrown);
			return fail(500, { inviteMessage: 'The invite could not be created. Try again.' });
		}
		if (isAdminRefusal(made)) refused(made.refused);
		return { invite: { link: made.link, expiresAt: made.expiresAt } };
	},

	/** Cancels a pending Invite. An unknown, used or already-cancelled one gets the same fixed message. */
	cancel: async ({ locals, request }) => {
		const { identity, multiUser } = locals;
		if (!identity) error(403, 'Forbidden');
		if (!multiUser) error(404, 'Not found');
		const id = (await request.formData()).get('id');
		let answer: Awaited<ReturnType<typeof multiUser.adminActions.cancelInvite>>;
		try {
			answer = await multiUser.adminActions.cancelInvite({
				who: identity,
				id: typeof id === 'string' ? id : ''
			});
		} catch (thrown) {
			logFailure('users: cancel invite', thrown);
			return fail(500, { cancelMessage: 'The invite could not be cancelled. Try again.' });
		}
		if (isAdminRefusal(answer)) refused(answer.refused);
		if (!answer.cancelled) return fail(404, { cancelMessage: 'That invite is no longer pending.' });
		return { cancelled: true };
	},

	/**
	 * Resets a user's password to a random one-time password and answers with it: the one response
	 * that ever carries it (never cached: the hook sets `no-store` on every /users response; never in
	 * a redirect, a log or a later load; stored only as a hash). It also ends the user's sessions and
	 * makes them set a new password, all through the Admin actions. Admin only, checked first.
	 * Resetting your own password is refused: it would end the session that is about to show the password.
	 */
	reset: async ({ locals, request }) => {
		const { multiUser, identity } = locals;
		if (!identity) error(403, 'Forbidden');
		if (!multiUser) error(404, 'Not found');
		const id = (await request.formData()).get('id');
		// Which row a failure belongs to; the page shows it on that row.
		const resetUserId = typeof id === 'string' ? id : '';
		let answer: Awaited<ReturnType<typeof multiUser.adminActions.resetPassword>>;
		try {
			answer = await multiUser.adminActions.resetPassword({
				who: identity,
				headers: request.headers,
				userId: resetUserId
			});
		} catch (thrown) {
			logFailure('users: reset password', thrown);
			return fail(500, {
				resetMessage: 'The password could not be reset. Try again.',
				resetUserId
			});
		}
		if (!isAdminRefusal(answer))
			return { reset: { userId: resetUserId, password: answer.password } };
		switch (answer.refused) {
			case 'UNKNOWN_ACCOUNT':
				return fail(404, { resetMessage: 'That user no longer exists.', resetUserId });
			case 'SELF_RESET':
				return fail(400, { resetMessage: 'You cannot reset your own password here.', resetUserId });
			default:
				return refused(answer.refused);
		}
	},

	/**
	 * Removes an Account and its Learner with all its progress (the Account first, then the Learner,
	 * and the bare plugin endpoint is off over HTTP). Admin only, checked first; removing yourself is
	 * refused. Failures answer with fixed texts and log only the kind of error.
	 */
	remove: async ({ locals, request }) => {
		const { multiUser, identity } = locals;
		if (!identity) error(403, 'Forbidden');
		if (!multiUser) error(404, 'Not found');
		const id = (await request.formData()).get('id');
		let answer: Awaited<ReturnType<typeof multiUser.adminActions.removeAccount>>;
		try {
			answer = await multiUser.adminActions.removeAccount({
				who: identity,
				headers: request.headers,
				userId: typeof id === 'string' ? id : ''
			});
		} catch (thrown) {
			logFailure('users: remove account', thrown);
			return fail(500, { removeMessage: 'The account could not be removed. Try again.' });
		}
		if (!isAdminRefusal(answer)) return { removed: true };
		switch (answer.refused) {
			case 'UNKNOWN_ACCOUNT':
				return fail(404, { removeMessage: 'That user no longer exists.' });
			case 'SELF_REMOVE':
				return fail(400, { removeMessage: 'You cannot remove yourself.' });
			case 'PROGRESS_NOT_REMOVED':
				// No error to name here: the code is the kind.
				console.error('users: remove account PROGRESS_NOT_REMOVED');
				return fail(500, {
					removeMessage:
						'The account was removed, but its progress could not be deleted. It can no longer sign in.'
				});
			default:
				return refused(answer.refused);
		}
	}
};
