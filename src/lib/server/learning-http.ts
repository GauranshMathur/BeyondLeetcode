import { error } from '@sveltejs/kit';
import { LearningError, type LearningErrorCode } from './learning/core.ts';

/** The one place a Learning core error becomes an HTTP status. */
const STATUS: Record<LearningErrorCode, number> = {
	NotFound: 404,
	TopicLocked: 403,
	RevisionConflict: 409,
	InvalidBuild: 400,
	NoMoreHints: 409,
	RunnerUnavailable: 503
};

/** Runs a Learning core call; a LearningError becomes the matching HTTP error, anything else is rethrown. */
export async function withLearningErrors<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (e) {
		// A refusal after a save (Runner outage) carries the saved revision in the body.
		if (e instanceof LearningError)
			error(
				STATUS[e.code],
				e.revision === undefined ? e.code : { message: e.code, revision: e.revision }
			);
		throw e;
	}
}
