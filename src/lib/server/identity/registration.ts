import type { Instance } from '../instance.ts';
import type { AdmitSignUp } from './auth.ts';
import { FIRST_ADMIN_LEARNER_ID, isFirstAdmin } from './setup.ts';

/**
 * Who may create an Account, asked on every sign-up (email or OAuth) by the one creation hook.
 * Checked in this order:
 *  1. the call `createFirstAdmin` makes, marked by a flag no client request can set: onto the
 *     Local Learner, as admin;
 *  2. (later card) an invite being accepted;
 *  3. anyone, when the Instance is multi-user and its Registration Mode is open: a new Learner.
 *
 * Everything else is refused. The Registration Mode is read at each call, never cached here, so a
 * toggle takes effect on the next sign-up. Must stay free of side effects (see `AdmitSignUp`).
 */
export function createRegistration({
	instance
}: {
	instance: Pick<Instance, 'mode' | 'registrationMode'>;
}): AdmitSignUp {
	return () => {
		if (isFirstAdmin()) return { learnerId: FIRST_ADMIN_LEARNER_ID, role: 'admin' };
		if (instance.mode() === 'multi' && instance.registrationMode() === 'open') return {};
		return null;
	};
}
