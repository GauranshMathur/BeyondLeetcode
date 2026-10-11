import type { Action } from '@sveltejs/kit';
import { languageById } from '$lib/languages';
import type { BuildFiles } from '$lib/server/content/catalogue';
import type { BuildRef, Learner } from '$lib/server/learning/core';
import { refuse, withLearningErrors } from '$lib/server/learning-http';
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

function parseJson(value: FormDataEntryValue | null): unknown {
	try {
		return JSON.parse(String(value));
	} catch {
		return undefined;
	}
}

/** The Build reference the page was issued, posted back unchanged. */
function readRef(form: FormData, problemId: string): BuildRef {
	const ref = parseJson(form.get('build')) as Partial<Record<keyof BuildRef, unknown>> | null;
	const language = languageById(ref?.language)?.id;
	if (!language) refuse({ code: 'BadRequest' });
	if (ref?.problemId !== problemId || !Number.isInteger(ref?.revision)) {
		refuse({ code: 'BadRequest' });
	}
	return { problemId, language, revision: ref.revision as number };
}

/** The page posts the whole Build's files with the reference. */
function readBuild(form: FormData, problemId: string) {
	const files = parseJson(form.get('files'));
	if (typeof files !== 'object' || files === null || Array.isArray(files)) {
		refuse({ code: 'BadRequest' });
	}
	return { build: readRef(form, problemId), files: files as BuildFiles };
}

/** Save, Run and Submit differ only in what the core does with the Build the page posts. */
const buildAction =
	(act: (learner: Learner, build: BuildRef, files: BuildFiles) => Promise<object>): Action =>
	async ({ locals, params, request }) => {
		const { build, files } = readBuild(await request.formData(), params.problemId ?? '');
		return withLearningErrors(() => act(locals.learning, build, files));
	};

export const actions: Actions = {
	/** Language picker: builds this Problem's Topic in another Language, keeping the other Builds. */
	switchLanguage: async ({ locals, params, request }) => {
		const language = String((await request.formData()).get('language'));
		const picked = languageById(language)?.id;
		if (!picked) refuse({ code: 'BadRequest' });
		await withLearningErrors(() => locals.learning.switchLanguage(params.problemId, picked));
		return { language: picked };
	},

	/** Reveals the next Hint; the core answers a reveal past the last one with the Hints as they are. */
	revealHint: ({ locals, params }) =>
		withLearningErrors(async () => ({
			hints: await locals.learning.revealHint(params.problemId ?? '')
		})),

	/** Replaces this Build with the Reference Code after the previous Problem; the core decides what that is. */
	startFromReferenceCode: async ({ locals, params, request }) => {
		const build = readRef(await request.formData(), params.problemId ?? '');
		return withLearningErrors(() => locals.learning.startFromReferenceCode(build));
	},

	/** Autosave. */
	save: buildAction((learner, build, files) => learner.saveCode(build, files)),

	/** Run: saves, then the Example Tests only. Never changes progress. */
	run: buildAction((learner, build, files) => learner.run(build, files)),

	/** Submit: saves, runs every Test, records the Submission. Hidden Test data never leaves the server. */
	submit: buildAction((learner, build, files) => learner.submit(build, files))
};
