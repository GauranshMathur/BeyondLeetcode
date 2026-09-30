import type { Learner } from '$lib/server/learning/core';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			learnerId: string;
			/** The Learning core acting for this request's Learner. */
			learning: Learner;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}
