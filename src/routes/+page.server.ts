import { signedIn } from '$lib/server/signed-in';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	map: await signedIn(locals).learning.map()
});
