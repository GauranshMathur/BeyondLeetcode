import { error } from '@sveltejs/kit';
import { encodeRefusal, type Refusal } from '$lib/problem-wire';
import { LearningError } from './learning/core.ts';

/** Refuses the request with the wire contract's code and status (`$lib/problem-wire`). */
export function refuse(refusal: Refusal): never {
	const { status, body } = encodeRefusal(refusal);
	error(status, body);
}

/** Runs a Learning core call; a LearningError becomes the refusal with its code, anything else is rethrown. */
export async function withLearningErrors<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (e) {
		// A refusal after a save (Runner outage) carries the saved revision.
		if (e instanceof LearningError) refuse({ code: e.code, revision: e.revision });
		throw e;
	}
}
