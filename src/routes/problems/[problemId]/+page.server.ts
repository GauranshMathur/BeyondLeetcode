import { fail } from '@sveltejs/kit';
import { withLearningErrors } from '$lib/server/learning-http';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => ({
	problem: await withLearningErrors(() => locals.learning.problem(params.problemId))
});

export const actions: Actions = {
	/** Autosave: the page posts the whole Build with the revision it was based on. */
	save: async ({ locals, params, request }) => {
		const form = await request.formData();
		let files: unknown;
		try {
			files = JSON.parse(String(form.get('files')));
		} catch {
			return fail(400, { message: 'files must be JSON' });
		}
		const rawRevision = form.get('baseRevision');
		const baseRevision =
			typeof rawRevision === 'string' && rawRevision !== '' ? Number(rawRevision) : Number.NaN;
		if (
			typeof files !== 'object' ||
			files === null ||
			Array.isArray(files) ||
			!Number.isInteger(baseRevision)
		) {
			return fail(400, { message: 'files and baseRevision are required' });
		}
		return withLearningErrors(() =>
			locals.learning.saveCode(params.problemId, files as Record<string, string>, baseRevision)
		);
	}
};
