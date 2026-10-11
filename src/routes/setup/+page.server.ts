import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	/** Step 1: choose a mode. Only Local can be chosen yet. */
	default: async ({ request, locals }) => {
		const mode = (await request.formData()).get('mode');
		if (mode !== 'local') return fail(400, { message: 'Choose Local to continue.' });
		// A second choice that lost the race lands here too: the Instance is set up, so go to the Map.
		if (locals.instance.mode() === null) {
			try {
				await locals.instance.chooseLocal();
			} catch (error) {
				if (locals.instance.mode() === null) throw error;
			}
		}
		redirect(303, '/');
	}
};
