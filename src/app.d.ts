import type { Identity } from '$lib/server/identity';
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
			/** Who this request is, from Identity. Unset only on /setup before the Instance is set up. */
			identity: Identity;
			/** The Learning core acting for this request's Learner. Unset exactly when `identity` is. */
			learning: Learner;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}
