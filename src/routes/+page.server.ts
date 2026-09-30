import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({ map: await locals.learning.map() });
