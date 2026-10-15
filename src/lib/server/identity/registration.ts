import type { AdmitSignUp } from './auth.ts';
import { FIRST_ADMIN_LEARNER_ID, isFirstAdmin } from './setup.ts';

/**
 * Who may create an Account. Today exactly one case: the call `createFirstAdmin` makes, marked by
 * a flag no client request can set. Everything else is refused.
 *
 * Open registration and invites are later cards; their rules join the checks below, in this order:
 * first admin, then an invite being accepted, then open registration when the Instance allows it.
 */
export function createRegistration(): AdmitSignUp {
	return () => {
		if (isFirstAdmin()) return { learnerId: FIRST_ADMIN_LEARNER_ID, role: 'admin' };
		return null;
	};
}
