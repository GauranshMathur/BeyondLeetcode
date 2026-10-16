import { error, fail } from '@sveltejs/kit';
import { listAccounts, NotAdminError } from '$lib/server/identity/accounts';
import { isRegistrationMode, RegistrationNotAvailableError } from '$lib/server/instance';
import type { Actions, PageServerLoad } from './$types';

/**
 * Every Account, for the admin, and the Registration Mode they can switch. The hook's gate has
 * already sent a signed-out visitor to Sign in, given a learner 403 and hidden the page in Local
 * Mode (404); this load checks again and fails closed, because it is the one that reads the Accounts.
 */
export const load: PageServerLoad = async ({ locals, request, setHeaders }) => {
	const { auth, identity, invites } = locals;
	// Better Auth is set only in Multi-user Mode: Local Mode has no Accounts, whatever role it gives the Local Learner.
	if (!auth) error(404, 'Not found');
	if (!identity) error(403, 'Forbidden');
	try {
		const accounts = await listAccounts(auth, { who: identity, headers: request.headers });
		// Set exactly when `auth` is; fail closed anyway. After the Accounts, whose read refuses a learner first.
		if (!invites) error(404, 'Not found');
		const pending = await invites.listPending({ who: identity, now: new Date() });
		// Names and emails of everyone, and the pending Invites: not for a shared cache, nor for the back button after sign-out.
		setHeaders({ 'Cache-Control': 'no-store' });
		return { accounts, pending, registration: locals.instance.registrationMode() };
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
	 * never cached, never put in a redirect, and not stored (only its hash is). Admin only, checked first.
	 */
	invite: async ({ locals, setHeaders }) => {
		const { identity, invites } = locals;
		if (identity?.role !== 'admin') error(403, 'Forbidden');
		if (!invites) error(404, 'Not found');
		setHeaders({ 'Cache-Control': 'no-store' });
		try {
			const made = await invites.create({ who: identity, now: new Date() });
			return { invite: { link: made.link, expiresAt: made.expiresAt } };
		} catch (thrown) {
			if (thrown instanceof NotAdminError) error(403, 'Forbidden');
			console.error(
				'Users: creating an Invite failed:',
				thrown instanceof Error ? thrown.name : typeof thrown
			);
			return fail(500, { message: 'The invite could not be created. Try again.' });
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
			if (!cancelled) return fail(404, { message: 'That invite is no longer pending.' });
		} catch (thrown) {
			if (thrown instanceof NotAdminError) error(403, 'Forbidden');
			console.error(
				'Users: cancelling an Invite failed:',
				thrown instanceof Error ? thrown.name : typeof thrown
			);
			return fail(500, { message: 'The invite could not be cancelled. Try again.' });
		}
		return { cancelled: true };
	}
};
