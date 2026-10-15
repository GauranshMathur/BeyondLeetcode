import { error } from '@sveltejs/kit';
import { listAccounts, NotAdminError } from '$lib/server/identity/accounts';
import type { PageServerLoad } from './$types';

/**
 * Every Account, for the admin. The hook's gate has already sent a signed-out visitor to Sign in,
 * given a learner 403 and hidden the page in Local Mode (404); this load checks again and fails
 * closed, because it is the one that reads the Accounts.
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
		return { accounts };
	} catch (thrown) {
		if (thrown instanceof NotAdminError) error(403, 'Forbidden');
		throw thrown;
	}
};
