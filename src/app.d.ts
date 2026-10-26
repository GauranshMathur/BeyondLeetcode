import type { Setup } from '$lib/server/app';
import type { Identity } from '$lib/server/identity';
import type { Auth } from '$lib/server/identity/auth';
import type { Invites } from '$lib/server/identity/invites';
import type { Instance } from '$lib/server/instance';
import type { Learner } from '$lib/server/learning/core';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			/** Set when the code was saved before the refusal: the revision the save produced. */
			revision?: number;
		}
		interface Locals {
			/** The Instance: its mode and the one-time choice Setup makes. */
			instance: Instance;
			/** What the Setup screen needs: the Multi-user choice and creating the first admin. */
			setup: Setup;
			/** Better Auth; set only in Multi-user Mode, where the auth route mounts its handler. */
			auth?: Auth;
			/** Invite links; set exactly when `auth` is (Multi-user Mode), so Local Mode never has them. */
			invites?: Invites;
			/** Deletes a Learner and all its progress (Users, remove an Account); set exactly when `auth` is. */
			deleteLearner?: (learnerId: string) => Promise<void>;
			/**
			 * Who this request is, from Identity. Unset where nobody is resolved: /setup before the Instance is
			 * set up, and the public pages of a multi-user Instance (Sign in, Sign up, Accept invite). A
			 * signed-in route reads it through `signedIn` (`$lib/server/signed-in`), which throws when unset.
			 */
			identity?: Identity;
			/** The Learning core acting for this request's Learner. Unset exactly when `identity` is. */
			learning?: Learner;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}
