import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

/** The Instance module's refusal when someone set it up first (see instance.ts). */
const isAlreadySetUp = (error: unknown) =>
	error instanceof Error && error.message.includes('already set up');

export const actions: Actions = {
	/** Step 1: choose a mode. Only Local can be chosen yet. */
	default: async ({ request, locals }) => {
		const mode = (await request.formData()).get('mode');
		if (mode !== 'local') return fail(400, { message: 'Choose Local to continue.' });
		try {
			await locals.instance.chooseLocal();
		} catch (error) {
			// A second choice that lost the race goes to the Map like the first; any other failure is real.
			if (!isAlreadySetUp(error)) throw error;
		}
		redirect(303, '/');
	}
};
