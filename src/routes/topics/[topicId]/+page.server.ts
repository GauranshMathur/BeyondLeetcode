import { withLearningErrors } from '$lib/server/learning-http';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => ({
	topic: await withLearningErrors(() => locals.learning.topic(params.topicId))
});
