import { fail } from '@sveltejs/kit';
import { LearningError } from '$lib/server/learning/core';
import { withLearningErrors } from '$lib/server/learning-http';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => ({
	problem: await withLearningErrors(() => locals.learning.problem(params.problemId))
});

/** The picker offers these; Go joins with C7b. */
const PICKABLE = ['python', 'typescript', 'go'] as const;

/** The page posts the whole Build with the revision it was based on and the Language it showed. */
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
	const language = PICKABLE.find((l) => l === form.get('language'));
	if (!language)
		return { failure: fail(400, { message: 'language must be python, typescript or go' }) };
	return { files: files as Record<string, string>, baseRevision, language };
}

export const actions: Actions = {
	/** Language picker: builds this Problem's Topic in another Language, keeping the other Builds. */
	switchLanguage: async ({ locals, params, request }) => {
		const language = String((await request.formData()).get('language'));
		const picked = PICKABLE.find((l) => l === language);
		if (!picked) return fail(400, { message: 'language must be python, typescript or go' });
		const { topicId } = await withLearningErrors(() => locals.learning.problem(params.problemId));
		await withLearningErrors(() => locals.learning.switchLanguage(topicId, picked));
		return { language: picked };
	},

	/** Autosave. */
	save: async ({ locals, params, request }) => {
		const build = await readBuild(request);
		if (build.failure) return build.failure;
		return withLearningErrors(() =>
			locals.learning.saveCode(params.problemId, build.files, build.baseRevision, build.language)
		);
	},

	/** Run: saves, then the Example Tests only. Never changes progress. */
	run: async ({ locals, params, request }) => {
		const build = await readBuild(request);
		if (build.failure) return build.failure;
		return withLearningErrors(async () => {
			try {
				return await locals.learning.run(
					params.problemId,
					build.files,
					build.baseRevision,
					build.language
				);
			} catch (e) {
				if (!(e instanceof LearningError) || e.code !== 'RunnerUnavailable') throw e;
				// The code was saved before the Runner failed: tell the page the revision this Run saved.
				return fail(503, { message: e.code, revision: build.baseRevision + 1 });
			}
		});
	},

	/** Submit: saves, runs every Test, records the Submission. Hidden Test data never leaves the server. */
	submit: async ({ locals, params, request }) => {
		const build = await readBuild(request);
		if (build.failure) return build.failure;
		return withLearningErrors(async () => {
			try {
				return await locals.learning.submit(
					params.problemId,
					build.files,
					build.baseRevision,
					build.language
				);
			} catch (e) {
				if (!(e instanceof LearningError) || e.code !== 'RunnerUnavailable') throw e;
				// Nothing was recorded, but the code was saved before the Runner failed.
				return fail(503, { message: e.code, revision: build.baseRevision + 1 });
			}
		});
	}
};
