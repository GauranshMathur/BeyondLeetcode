import { error } from '@sveltejs/kit';
import { LearningError, type LearningErrorCode } from './learning/core.ts';

/** The one place a Learning core error becomes an HTTP status. */
const STATUS: Record<LearningErrorCode, number> = { NotFound: 404, TopicLocked: 403 };

/** Runs a Learning core call; a LearningError becomes the matching HTTP error, anything else is rethrown. */
export async function withLearningErrors<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (e) {
		if (e instanceof LearningError) error(STATUS[e.code], e.code);
		throw e;
	}
}
