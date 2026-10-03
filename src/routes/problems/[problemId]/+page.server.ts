import { fail } from '@sveltejs/kit';
import { LearningError } from '$lib/server/learning/core';
import { withLearningErrors } from '$lib/server/learning-http';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => ({
	problem: await withLearningErrors(() => locals.learning.problem(params.problemId))
});

/** The page posts the whole Build with the revision it was based on. */
async function readBuild(request: Request) {
	const form = await request.formData();
	let files: unknown;
	try {
		files = JSON.parse(String(form.get('files')));
	} catch {
		return { failure: fail(400, { message: 'files must be JSON' }) };
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
		return { failure: fail(400, { message: 'files and baseRevision are required' }) };
	}
	return { files: files as Record<string, string>, baseRevision };
}

export const actions: Actions = {
	/** Autosave. */
	save: async ({ locals, params, request }) => {
		const build = await readBuild(request);
		if (build.failure) return build.failure;
		return withLearningErrors(() =>
			locals.learning.saveCode(params.problemId, build.files, build.baseRevision)
		);
	},

	/** Run: saves, then the Example Tests only. Never changes progress. */
	run: async ({ locals, params, request }) => {
		const build = await readBuild(request);
		if (build.failure) return build.failure;
		return withLearningErrors(async () => {
			try {
				return await locals.learning.run(params.problemId, build.files, build.baseRevision);
			} catch (e) {
				if (!(e instanceof LearningError) || e.code !== 'RunnerUnavailable') throw e;
				// The code was saved before the Runner failed: tell the page the new revision.
				const { revision } = await locals.learning.problem(params.problemId);
				return fail(503, { message: e.code, revision });
			}
		});
	}
};
