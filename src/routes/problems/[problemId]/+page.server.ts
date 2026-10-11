import { type Action, fail } from '@sveltejs/kit';
import { LANGUAGE_IDS, languageById } from '$lib/languages';
import type { BuildFiles } from '$lib/server/content/catalogue';
import { type BuildRef, type Learner, LearningError } from '$lib/server/learning/core';
import { withLearningErrors } from '$lib/server/learning-http';
import type { Actions, PageServerLoad } from './$types';

/** The tabs of the left pane; the Problem is the default and has no `?tab`. */
export type Tab = 'problem' | 'hints' | 'solution';

const tabOf = (value: string | null): Tab =>
	value === 'hints' || value === 'solution' ? value : 'problem';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const tab = tabOf(url.searchParams.get('tab'));
	return {
		tab,
		problem: await withLearningErrors(() => locals.learning.problem(params.problemId)),
		// Only the revealed Hints, and only when the tab is open.
		hints:
			tab === 'hints'
				? await withLearningErrors(() => locals.learning.hints(params.problemId))
				: undefined,
		// The Solution is read only when its tab is open, never with the Problem.
		solution:
			tab === 'solution'
				? await withLearningErrors(() => locals.learning.solution(params.problemId))
				: undefined
	};
};

const NOT_A_LANGUAGE = `language must be ${LANGUAGE_IDS.slice(0, -1).join(', ')} or ${LANGUAGE_IDS.at(-1)}`;

function parseJson(value: FormDataEntryValue | null): unknown {
	try {
		return JSON.parse(String(value));
	} catch {
		return undefined;
	}
}

/** The page posts the whole Build's files and the Build reference it was issued, unchanged. */
function readBuild(form: FormData, problemId: string) {
	const files = parseJson(form.get('files'));
	if (typeof files !== 'object' || files === null || Array.isArray(files)) {
		return { failure: fail(400, { message: 'files must be a JSON object' }) };
	}
	const ref = parseJson(form.get('build')) as Partial<Record<keyof BuildRef, unknown>> | null;
	const language = languageById(ref?.language)?.id;
	if (!language) return { failure: fail(400, { message: NOT_A_LANGUAGE }) };
	if (ref?.problemId !== problemId || !Number.isInteger(ref?.revision)) {
		return { failure: fail(400, { message: 'build must name this problem and a revision' }) };
	}
	const build: BuildRef = { problemId, language, revision: ref.revision as number };
	return { build, files: files as BuildFiles };
}

/** Save, Run and Submit differ only in what the core does with the Build the page posts. */
const buildAction =
	(act: (learner: Learner, build: BuildRef, files: BuildFiles) => Promise<object>): Action =>
	async ({ locals, params, request }) => {
		const posted = readBuild(await request.formData(), params.problemId ?? '');
		if (posted.failure) return posted.failure;
		return withLearningErrors(() => act(locals.learning, posted.build, posted.files));
	};

export const actions: Actions = {
	/** Language picker: builds this Problem's Topic in another Language, keeping the other Builds. */
	switchLanguage: async ({ locals, params, request }) => {
		const language = String((await request.formData()).get('language'));
		const picked = languageById(language)?.id;
		if (!picked) return fail(400, { message: NOT_A_LANGUAGE });
		await withLearningErrors(() => locals.learning.switchLanguage(params.problemId, picked));
		return { language: picked };
	},

	/** Reveals the next Hint. A second reveal past the last one answers with the current Hints. */
	revealHint: ({ locals, params }) =>
		withLearningErrors(async () => {
			try {
				return { hints: await locals.learning.revealHint(params.problemId ?? '') };
			} catch (e) {
				if (e instanceof LearningError && e.code === 'NoMoreHints')
					return { hints: await locals.learning.hints(params.problemId ?? '') };
				throw e;
			}
		}),

	/** Autosave. */
	save: buildAction((learner, build, files) => learner.saveCode(build, files)),

	/** Run: saves, then the Example Tests only. Never changes progress. */
	run: buildAction((learner, build, files) => learner.run(build, files)),

	/** Submit: saves, runs every Test, records the Submission. Hidden Test data never leaves the server. */
	submit: buildAction((learner, build, files) => learner.submit(build, files))
};
