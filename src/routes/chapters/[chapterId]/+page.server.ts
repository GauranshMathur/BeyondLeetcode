import { withLearningErrors } from '$lib/server/learning-http';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => ({
	chapter: await withLearningErrors(() => locals.learning.chapter(params.chapterId))
});

export const actions: Actions = {
	/** The page calls this once when the Learner scrolls to the end of the Chapter. */
	reachEnd: async ({ locals, params }) => ({
		change: await withLearningErrors(() => locals.learning.reachChapterEnd(params.chapterId))
	})
};
