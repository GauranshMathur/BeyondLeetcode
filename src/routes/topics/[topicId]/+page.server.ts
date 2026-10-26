import { withLearningErrors } from '$lib/server/learning-http';
import { signedIn } from '$lib/server/signed-in';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => ({
	topic: await withLearningErrors(() => signedIn(locals).learning.topic(params.topicId))
});
