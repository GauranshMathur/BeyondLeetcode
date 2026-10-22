import type { Instance } from '../instance.ts';
import type { AdmitSignUp } from './auth.ts';
import type { Invites } from './invites.ts';
import { FIRST_ADMIN_LEARNER_ID, isFirstAdmin } from './setup.ts';

/**
 * Who may create an Account, asked on every sign-up (email or OAuth) by the one creation hook.
 * Checked in this order:
 *  1. the call `createFirstAdmin` makes, marked by a flag no client request can set: onto the
 *     Local Learner, as admin;
 *  2. an invite being accepted, when the Instance is multi-user: the request carries a token that
 *     names an Invite not used, not expired and not cancelled: a new Learner. This only checks
 *     (`lookup`); the Invite is spent by `createAuth`'s `user.create.after` hook (`claim`);
 *  3. anyone, when the Instance is multi-user and its Registration Mode is open: a new Learner.
 *
 * Everything else is refused. The Registration Mode is read at each call, never cached here, so a
 * toggle takes effect on the next sign-up. Must stay free of side effects (see `AdmitSignUp`).
 *
 * `invites` is optional: without it a token is never honoured. `now` is for tests.
 */
export function createRegistration({
	instance,
	invites,
	now = () => new Date()
}: {
	instance: Pick<Instance, 'mode' | 'registrationMode'>;
	invites?: Pick<Invites, 'lookup'>;
	now?: () => Date;
}): AdmitSignUp {
	return async ({ inviteToken }) => {
		if (isFirstAdmin()) return { learnerId: FIRST_ADMIN_LEARNER_ID, role: 'admin' };
		if (instance.mode() !== 'multi') return null;
		// An open Instance needs no Invite, and a token on the request is then ignored, never spent.
		if (instance.registrationMode() === 'open') return {};
		if (inviteToken && invites && (await invites.lookup(inviteToken, now()))) {
			return { inviteToken };
		}
		return null;
	};
}
