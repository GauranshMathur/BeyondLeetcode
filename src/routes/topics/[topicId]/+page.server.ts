import { error } from '@sveltejs/kit';
import { LearningError, type LearningErrorCode } from '$lib/server/learning/core';
import type { PageServerLoad } from './$types';

/** The one place a Learning core error becomes an HTTP status. */
const STATUS: Record<LearningErrorCode, number> = { NotFound: 404, TopicLocked: 403 };

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		return { topic: await locals.learning.topic(params.topicId) };
	} catch (e) {
		if (e instanceof LearningError) error(STATUS[e.code], e.code);
		throw e;
	}
};
