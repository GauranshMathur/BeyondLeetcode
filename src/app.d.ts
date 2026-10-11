import type { Identity } from '$lib/server/identity';
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
			/** Who this request is, from Identity. */
			identity: Identity;
			/** The Learning core acting for this request's Learner. */
			learning: Learner;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}
