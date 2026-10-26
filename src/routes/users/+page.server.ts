import { error, fail } from '@sveltejs/kit';
import {
	listAccounts,
	NotAdminError,
	ProgressNotRemovedError,
	removeAccount,
	resetPassword,
	SelfRemoveError,
	SelfResetError,
	UnknownAccountError
} from '$lib/server/identity/accounts';
import { isRegistrationMode, RegistrationNotAvailableError } from '$lib/server/instance';
import type { Actions, PageServerLoad } from './$types';

/**
 * Every Account, for the admin, and the Registration Mode they can switch. The hook's gate has
 * already sent a signed-out visitor to Sign in, given a learner 403 and hidden the page in Local
 * Mode (404); this load checks again and fails closed, because it is the one that reads the Accounts.
 */
export const load: PageServerLoad = async ({ locals, request, url }) => {
	const { auth, identity, invites } = locals;
	// Better Auth is set only in Multi-user Mode: Local Mode has no Accounts, whatever role it gives the Local Learner.
	if (!auth) error(404, 'Not found');
	if (!identity) error(403, 'Forbidden');
	try {
		const accounts = await listAccounts(auth, { who: identity, headers: request.headers });
		// Set exactly when `auth` is; fail closed anyway. After the Accounts, whose read refuses a learner first.
		if (!invites) error(404, 'Not found');
		const pending = await invites.listPending({ who: identity, now: new Date() });
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
	} catch (thrown) {
		if (thrown instanceof NotAdminError) error(403, 'Forbidden');
		throw thrown;
	}
};

export const actions: Actions = {
	/**
	 * Switches who may create an Account. It decides who can, so it checks like the load does, and
	 * first: the role must be `admin` exactly (not merely a role that contains it). The gate has
	 * already judged the request; this does not rely on it. Cross-site posts are refused by
	 * SvelteKit's origin check on form actions.
	 */
	registration: async ({ locals, request }) => {
		const { auth, identity, instance } = locals;
		if (identity?.role !== 'admin') error(403, 'Forbidden');
		// Local Mode has no Accounts to register, whatever role it gives the Local Learner.
		if (!auth) error(404, 'Not found');

		const choice = (await request.formData()).get('registration');
		if (!isRegistrationMode(choice)) {
			return fail(400, { message: 'Choose invite only or open.' });
		}
		try {
			// Writes the database, then memory: the next sign-up sees it, with no restart.
			await instance.setRegistrationMode(choice);
		} catch (thrown) {
			if (thrown instanceof RegistrationNotAvailableError) error(404, 'Not found');
			// Only the kind of failure is logged: an error's text may hold paths and query text.
			console.error(
				'Users: switching the Registration Mode failed:',
				thrown instanceof Error ? thrown.name : typeof thrown
			);
			return fail(500, { message: 'Registration could not be changed. Try again.' });
		}
		return { registration: choice };
	},

	/**
	 * Makes an Invite and answers with its link: the one response that ever carries the token. It is
	 * never cached (the hook sets `no-store` on every /users response), never put in a redirect, and not stored (only its hash is). Admin only, checked first.
	 */
	invite: async ({ locals }) => {
		const { identity, invites } = locals;
		if (identity?.role !== 'admin') error(403, 'Forbidden');
		if (!invites) error(404, 'Not found');
		try {
			const made = await invites.create({ who: identity, now: new Date() });
			return { invite: { link: made.link, expiresAt: made.expiresAt } };
		} catch (thrown) {
			if (thrown instanceof NotAdminError) error(403, 'Forbidden');
			console.error(
				'Users: creating an Invite failed:',
				thrown instanceof Error ? thrown.name : typeof thrown
			);
			return fail(500, { inviteMessage: 'The invite could not be created. Try again.' });
		}
	},

	/** Cancels a pending Invite. An unknown, used or already-cancelled one gets the same fixed message. */
	cancel: async ({ locals, request }) => {
		const { identity, invites } = locals;
		if (identity?.role !== 'admin') error(403, 'Forbidden');
		if (!invites) error(404, 'Not found');
		const id = (await request.formData()).get('id');
		try {
			const cancelled = typeof id === 'string' && (await invites.cancel({ who: identity, id }));
			if (!cancelled) return fail(404, { cancelMessage: 'That invite is no longer pending.' });
		} catch (thrown) {
			if (thrown instanceof NotAdminError) error(403, 'Forbidden');
			console.error(
				'Users: cancelling an Invite failed:',
				thrown instanceof Error ? thrown.name : typeof thrown
			);
			return fail(500, { cancelMessage: 'The invite could not be cancelled. Try again.' });
		}
		return { cancelled: true };
	},

	/**
	 * Resets a user's password to a random one-time password and answers with it: the one response
	 * that ever carries it (never cached: the hook sets `no-store` on every /users response; never in
	 * a redirect, a log or a later load; stored only as a hash). It also ends the user's sessions and
	 * makes them set a new password, all through `auth.api` and not the bare plugin endpoint. Admin
	 * only, checked first. Resetting your own password is refused: it would end the session that is
	 * about to show the password.
	 */
	reset: async ({ locals, request }) => {
		const { auth, identity } = locals;
		if (identity?.role !== 'admin') error(403, 'Forbidden');
		if (!auth) error(404, 'Not found');
		const id = (await request.formData()).get('id');
		// Which row a failure belongs to; the page shows it on that row.
		const resetUserId = typeof id === 'string' ? id : '';
		try {
			const { password } = await resetPassword(auth, {
				who: identity,
				headers: request.headers,
				userId: resetUserId
			});
			return { reset: { userId: resetUserId, password } };
		} catch (thrown) {
			if (thrown instanceof NotAdminError) error(403, 'Forbidden');
			if (thrown instanceof UnknownAccountError) {
				return fail(404, { resetMessage: 'That user no longer exists.', resetUserId });
			}
			if (thrown instanceof SelfResetError) {
				return fail(400, { resetMessage: 'You cannot reset your own password here.', resetUserId });
			}
			console.error(
				'Users: resetting a password failed:',
				thrown instanceof Error ? thrown.name : typeof thrown
			);
			return fail(500, { resetMessage: 'The password could not be reset. Try again.', resetUserId });
		}
	},

	/**
	 * Removes an Account and its Learner with all its progress (`removeAccount`: the user first, then the
	 * Learner, and the bare plugin endpoint is off over HTTP). Admin only, checked first; removing yourself is
	 * refused. Failures answer with fixed texts and log only the kind of error.
	 */
	remove: async ({ locals, request }) => {
		const { auth, identity, deleteLearner } = locals;
		if (identity?.role !== 'admin') error(403, 'Forbidden');
		if (!auth || !deleteLearner) error(404, 'Not found');
		const id = (await request.formData()).get('id');
		try {
			await removeAccount(auth, {
				deleteLearner,
				who: identity,
				headers: request.headers,
				userId: typeof id === 'string' ? id : ''
			});
			return { removed: true };
		} catch (thrown) {
			if (thrown instanceof NotAdminError) error(403, 'Forbidden');
			if (thrown instanceof UnknownAccountError) {
				return fail(404, { removeMessage: 'That user no longer exists.' });
			}
			if (thrown instanceof SelfRemoveError) {
				return fail(400, { removeMessage: 'You cannot remove yourself.' });
			}
			console.error(
				'Users: removing an Account failed:',
				thrown instanceof Error ? thrown.name : typeof thrown
			);
			if (thrown instanceof ProgressNotRemovedError) {
				return fail(500, {
					removeMessage:
						'The account was removed, but its progress could not be deleted. It can no longer sign in.'
				});
			}
			return fail(500, { removeMessage: 'The account could not be removed. Try again.' });
		}
	}
};
