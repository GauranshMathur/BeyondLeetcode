import { withLearningErrors } from '#lib/server/learning-http.js';
import { signedIn } from '#lib/server/signed-in.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => ({
	topic: await withLearningErrors(() => signedIn(locals).learning.topic(params.topicId))
});
