import type { Db } from '../db.ts';
import type { Instance } from '../instance.ts';
import { deleteLearner } from '../learning/progress.ts';
import { type AccountActions, createAccountActions } from './account-actions.ts';
import { type Auth, createAuth, socialProvidersFrom } from './auth.ts';
import type { IdentityResolver } from './index.ts';
import { createInvites, type Invites } from './invites.ts';
import { createMultiUserIdentity, repairLearners } from './multi-user.ts';
import { createRegistration } from './registration.ts';
import { sweepStaleSessions } from './session-binding.ts';
import { createProviderStarts } from './throttle.ts';

/** Better Auth, the account actions, Invites and the Learner removal: what the Multi-user routes use. */
export interface MultiUser {
	auth: Auth;
	/**
	 * Sign in, sign up, change password and sign out, built once so each form's throttle is the process's.
	 * Always set by `createApp`.
	 */
	accounts: AccountActions;
	invites: Invites;
	/** `deleteLearner` of the progress module, bound to the database. */
	deleteLearner: (learnerId: string) => Promise<void>;
}

export interface MultiUserInstanceOptions {
	db: Db;
	instance: Instance;
	/** Already checked by the caller (`secretProblem`): a valid session-signing secret. */
	secret: string;
	/** Already checked by the caller (`parseOrigin`): the validated http(s) origin. */
	origin: string;
	/** The OAuth provider variables; a provider with only one of its two is left out. */
	providerEnv: Record<string, string | undefined>;
}

export interface MultiUserInstance {
	multiUser: MultiUser;
	/** The Multi-user adapter of the Identity module: who is it, from the session cookie. */
	resolver: IdentityResolver;
}

/**
 * Builds the Multi-user assembly of one Instance: Invites, admission, Better Auth with `claimInvite`
 * and the provider starts, the account actions, and the start-up repair. Built once per process
 * (ADR 0006: the mode is read once), so every throttle, the provider starts included, belongs to
 * the one Instance it answers.
 *
 * On an Instance that is already Multi-user the repair runs first (`repairLearners`, then
 * `sweepStaleSessions`), before any request: no sign-up or removal is in flight, so it cannot race one.
 */
export async function createMultiUserInstance(
	options: MultiUserInstanceOptions
): Promise<MultiUserInstance> {
	const { db, instance, secret, origin, providerEnv } = options;
	// Invite links name the same ORIGIN the cookies and the origin check use. The one Invites module
	// serves the Users page and, through the gate and the claim, sign-up.
	const invites = createInvites({ db, origin });
	// One per Instance: the Sign in page and the auth callback share it.
	const providerStarts = createProviderStarts();
	const auth = createAuth({
		db,
		origin,
		secret,
		admitSignUp: createRegistration({ instance, invites }),
		socialProviders: socialProvidersFrom(providerEnv),
		claimInvite: (token, now) => invites.claim(token, now),
		providerStarts
	});
	const accounts = createAccountActions({
		auth,
		providerStarts,
		registrationOpen: () => instance.registrationMode() === 'open',
		inviteValid: async (token) => (await invites.lookup(token, new Date())) !== null
	});
	if (instance.mode() === 'multi') await repairStartup(db);
	return {
		multiUser: {
			auth,
			accounts,
			invites,
			deleteLearner: (learnerId) => deleteLearner(db, learnerId)
		},
		resolver: createMultiUserIdentity(auth)
	};
}

async function repairStartup(db: Db): Promise<void> {
	const { created, removed } = await repairLearners(db);
	if (created > 0 || removed > 0) {
		console.warn(
			`Multi-user startup repair: ${created} missing Learner(s) created, ${removed} orphan Learner(s) removed.`
		);
	}
	const swept = await sweepStaleSessions(db);
	if (swept > 0) console.warn(`Multi-user startup repair: ${swept} unusable session(s) removed.`);
}
