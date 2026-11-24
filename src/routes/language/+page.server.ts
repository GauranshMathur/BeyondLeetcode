import { fail, redirect } from '@sveltejs/kit';
import { languageById } from '#lib/languages.js';
import { safeNext } from '#lib/server/identity/gate.js';
import { withLearningErrors } from '#lib/server/learning-http.js';
import { signedIn } from '#lib/server/signed-in.js';
import type { Actions, PageServerLoad } from './$types';

// The same form for whoever opens it: no Learner is read and nothing redirects.
export const load: PageServerLoad = ({ url }) => ({ next: safeNext(url.searchParams.get('next')) });

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const rawNext = form.get('next');
		const next = safeNext(typeof rawNext === 'string' ? rawNext : null);
		const language = languageById(form.get('language'));
		if (!language) return fail(400, { message: 'Choose a Language to continue.', next });
		await withLearningErrors(() => signedIn(locals).learning.setStartingLanguage(language.id));
		redirect(303, next);
	}
};
