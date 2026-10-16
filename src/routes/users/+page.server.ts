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
	const { auth, identity } = locals;
	// Better Auth is set only in Multi-user Mode: Local Mode has no Accounts, whatever role it gives the Local Learner.
	if (!auth) error(404, 'Not found');
	if (!identity) error(403, 'Forbidden');
	try {
		const accounts = await listAccounts(auth, { who: identity, headers: request.headers });
		// Names and emails of everyone: not for a shared cache, nor for the back button after sign-out.
		setHeaders({ 'Cache-Control': 'no-store' });
		return { accounts, registration: locals.instance.registrationMode() };
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
	}
};
