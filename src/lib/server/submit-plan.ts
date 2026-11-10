/**
 * The Tests a Submission runs, split by what the Runner may do with them. A leaf module: the
 * Content catalogue checks Submit batches with it and the Learning core plans Submissions with
 * it, so it imports from neither (types included) and declares the reads it needs itself.
 */

/** The most code one Build may hold, in UTF-8 bytes of paths and contents together. */
export const MAX_BUILD_BYTES = 256 * 1024;

/** One Test as the plan reads it. */
interface PlanTest {
	readonly id: string;
	readonly name: string;
	readonly input: string;
	readonly expected: string;
}

/** The catalogue reads `submitPlan` needs; the Content catalogue satisfies it structurally. */
export interface SubmitPlanCatalogue {
	problem(id: string): { readonly exampleTests: readonly PlanTest[] } | undefined;
	hiddenTests(problemId: string): readonly PlanTest[] | undefined;
	mainLinePlace(
		problemId: string
	): { readonly anchor: string; readonly earlier: readonly string[] } | undefined;
}

/** One Test of a Submission, with what only the server may know. */
export interface SubmitTest {
	readonly id: string;
	/** The `<name>` part of the id, as the Learner sees it. */
	readonly name: string;
	readonly input: string;
	readonly expected: string;
	/** The Problem this Test belongs to. */
	readonly problemId: string;
	readonly kind: 'example' | 'hidden';
}

/** The Tests of a Submission, split by what the Runner may do with them. */
export interface SubmitPlan {
	/** This Problem's Example Tests: the only Tests whose output is ever shown. Run in their own container. */
	readonly visible: readonly SubmitTest[];
	/**
	 * Every other Test, in order, in containers of at most the batch size each; only per-Test
	 * outcomes are read from them, never their output.
	 */
	readonly hidden: readonly (readonly SubmitTest[])[];
}

/**
 * The Tests a Submission runs. A Core Problem runs every earlier Core Problem's Tests then its
 * own; an Extra runs the Core Problems up to and including its parent, then its own. This
 * Problem's Example Tests go in `visible`, everything else in `hidden`, cut in order into batches
 * of at most `maxBatchTests`, so no Hidden input ever shares a container with a Test whose
 * output is shown, and no container runs more Tests than fit its time limit. Returns undefined
 * for an unknown Problem.
 */
export function submitPlan(
	catalogue: SubmitPlanCatalogue,
	problemId: string,
	maxBatchTests: number
): SubmitPlan | undefined {
	// A NaN or fractional size would slice every hidden Test away: an Accepted on the Examples alone.
	if (!Number.isInteger(maxBatchTests) || maxBatchTests < 1) {
		throw new RangeError(
			`maxBatchTests must be a whole number of at least 1, got ${maxBatchTests}`
		);
	}
	const size = maxBatchTests;
	const place = catalogue.mainLinePlace(problemId);
	if (!place) return undefined;
	// The Core Problems before the anchor, the anchor, then an Extra itself.
	const scope = [...place.earlier, place.anchor];
	if (place.anchor !== problemId) scope.push(problemId);
	const testsOf = (id: string, kind: SubmitTest['kind']): SubmitTest[] =>
		(
			(kind === 'example' ? catalogue.problem(id)?.exampleTests : catalogue.hiddenTests(id)) ?? []
		).map(({ id: testId, name, input, expected }) => ({
			id: testId,
			name,
			input,
			expected,
			problemId: id,
			kind
		}));
	const hidden = scope.flatMap((id) => [
		...(id === problemId ? [] : testsOf(id, 'example')),
		...testsOf(id, 'hidden')
	]);
	const batches: SubmitTest[][] = [];
	for (let i = 0; i < hidden.length; i += size) batches.push(hidden.slice(i, i + size));
	return { visible: testsOf(problemId, 'example'), hidden: batches };
}

/**
 * The Runner request for one batch of a Submission (or Run): code and Test inputs, never an
 * expected output. Built here so the Learning core, the content check and the catalogue's guard
 * send the same request. `L` is the Runner's Language id, kept generic so this leaf imports no
 * types from the Runner.
 */
export function batchRequest<L extends string>(
	language: L,
	files: Readonly<Record<string, string>>,
	tests: readonly { readonly id: string; readonly input: string }[],
	limits: { readonly timeoutMs: number; readonly memoryMb: number }
): {
	language: L;
	files: Record<string, string>;
	tests: { id: string; input: string }[];
	limits: { timeoutMs: number; memoryMb: number };
} {
	return {
		language,
		files: { ...files },
		tests: tests.map(({ id, input }) => ({ id, input })),
		limits: { timeoutMs: limits.timeoutMs, memoryMb: limits.memoryMb }
	};
}
