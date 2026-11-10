import type { BuildFiles, Catalogue, Language } from '../content/catalogue.ts';
import { sandboxConfig } from '../runner/config.ts';
import type { ExecuteResult, RunnerPort } from '../runner/port.ts';
import {
	batchRequest,
	submitPlan as planSubmission,
	type SubmitPlan,
	type SubmitTest
} from '../submit-plan.ts';
import { LearningError } from './errors.ts';
import { normaliseOutput, type SubmitFailure, type Verdict } from './rules.ts';

export type { SubmitPlan, SubmitTest };

/**
 * Judging a Submission: the one module that plans a Submission's Tests, runs them through the
 * Runner and turns the raw results into a Verdict. Everything a Learner sees of the outcome is
 * decided here: the batch order, when to stop, which Verdict wins and how much of the failure
 * may be shown (a Hidden Test only that it failed).
 */

type SubmitCatalogue = Pick<Catalogue, 'mainLinePlace' | 'problem' | 'hiddenTests'>;

/** What judging a Submission answers; `failingProblemId` is the Problem of the failure shown. */
export interface Judgement {
	readonly verdict: Verdict;
	readonly failure?: SubmitFailure;
	readonly failingProblemId?: string;
}

/** What a Submission is judged on. */
export interface SubmissionInput {
	readonly catalogue: SubmitCatalogue;
	readonly problemId: string;
	readonly language: Language;
	readonly files: BuildFiles;
	/** Without a Runner every Submission is RunnerUnavailable. */
	readonly runner: RunnerPort | undefined;
	/** Most hidden Tests in one container; defaults to the configured limit. */
	readonly hiddenBatchTests?: number;
}

/**
 * Plans, runs and judges one Submission. Throws NotFound for an unknown Problem and
 * RunnerUnavailable when the Runner is missing, fails, cuts a batch off (see `runBatch`), answers
 * without a Test, or compiles a Hidden batch badly. Visible Tests run in one container, then the hidden ones in containers of
 * at most `hiddenBatchTests`: nothing a Hidden Test runs shares one with a Test whose output is shown.
 */
export async function judgeSubmission(input: SubmissionInput): Promise<Judgement> {
	const { catalogue, problemId, language, files, runner } = input;
	const plan = submitPlan(
		catalogue,
		problemId,
		input.hiddenBatchTests ?? sandboxConfig.hiddenBatchTests
	);
	const batches = await runSubmission(plan, (tests) => runBatch(runner, language, files, tests));
	return judge(batches, problemId, (id) => catalogue.problem(id)?.title ?? id);
}

/**
 * Sends one batch to the Runner with the configured limits; the one place a Run or a Submission
 * reaches it. A missing or failing Runner, and a batch the container cut off, are all
 * RunnerUnavailable: a cut-off Test never ran to its own limit, so it is not the Learner's
 * Time Limit Exceeded (it may be a slow earlier Test that used up the container's time).
 */
export async function runBatch(
	runner: RunnerPort | undefined,
	language: Language,
	files: BuildFiles,
	tests: readonly { readonly id: string; readonly input: string }[]
): Promise<ExecuteResult> {
	if (!runner) throw new LearningError('RunnerUnavailable');
	let result: ExecuteResult;
	try {
		result = await runner.execute(
			batchRequest(language, files, tests, {
				timeoutMs: sandboxConfig.testTimeoutMs,
				memoryMb: sandboxConfig.memoryMb
			})
		);
	} catch (cause) {
		throw new LearningError('RunnerUnavailable', undefined, cause);
	}
	if (result.results.some((r) => r.cutOff)) throw new LearningError('RunnerUnavailable');
	return result;
}

/** The Tests a Submission runs (see the leaf module); throws NotFound for an unknown Problem. */
function submitPlan(
	catalogue: SubmitCatalogue,
	problemId: string,
	maxBatchTests: number
): SubmitPlan {
	const plan = planSubmission(catalogue, problemId, maxBatchTests);
	if (!plan) throw new LearningError('NotFound');
	return plan;
}

/** Worst first: the Verdict of a Submission is the first of these any Test produced. */
const VERDICT_PRECEDENCE: readonly Exclude<Verdict, 'Accepted'>[] = [
	'Compile Error',
	'Time Limit Exceeded',
	'Runtime Error',
	'Wrong Answer'
];

/** Whether one of the batch's own Tests timed out, matched by id as `judge` does. */
function timedOut(tests: readonly SubmitTest[], result: ExecuteResult): boolean {
	return tests.some((t) => result.results.find((r) => r.id === t.id)?.status === 'timeout');
}

/**
 * Runs a Submission's batches in order, the visible one first, and returns what `judge` takes.
 * It stops after a batch in which a Test timed out: Time Limit Exceeded outranks every outcome a
 * hidden batch can add (a Compile Error there is not a Verdict), and the first Test to time out
 * is already in hand, so the Verdict and the failure shown are what one container would give.
 * Any other failure runs on, since a later timeout would outrank it. A compile error in the
 * visible batch is the Verdict and stops the run; in a hidden batch it came from running Hidden
 * inputs, so it is not the Learner's to see: RunnerUnavailable.
 */
async function runSubmission(
	plan: SubmitPlan,
	execute: (tests: readonly SubmitTest[]) => Promise<ExecuteResult>
): Promise<{ tests: readonly SubmitTest[]; result: ExecuteResult }[]> {
	const ran: { tests: readonly SubmitTest[]; result: ExecuteResult }[] = [];
	if (plan.visible.length > 0) {
		const result = await execute(plan.visible);
		ran.push({ tests: plan.visible, result });
		if (result.compileError !== undefined) return ran;
		if (timedOut(plan.visible, result)) return ran;
	}
	for (const tests of plan.hidden) {
		const result = await execute(tests);
		if (result.compileError !== undefined) throw new LearningError('RunnerUnavailable');
		ran.push({ tests, result });
		if (timedOut(tests, result)) break;
	}
	return ran;
}

/**
 * Picks the Verdict from the Runner's raw results, one batch per Runner call, in run order.
 * Pure. Compile Error beats Time Limit Exceeded beats Runtime Error beats Wrong Answer beats
 * Accepted; the failure shown is the first Test, in run order, with the winning outcome. A
 * Runner answer that misses a Test is a failed Runner (RunnerUnavailable).
 */
function judge(
	batches: readonly { tests: readonly SubmitTest[]; result: ExecuteResult }[],
	problemId: string,
	titleOf: (problemId: string) => string
): { verdict: Verdict; failure?: SubmitFailure; failingProblemId?: string } {
	for (const { result } of batches) {
		if (result.compileError !== undefined) {
			return {
				verdict: 'Compile Error',
				failure: { kind: 'compile', message: result.compileError }
			};
		}
	}
	const outcomes = batches.flatMap(({ tests, result }) =>
		tests.map((test) => {
			const raw = result.results.find((r) => r.id === test.id);
			if (!raw) throw new LearningError('RunnerUnavailable');
			const verdict: Verdict =
				raw.status === 'timeout'
					? 'Time Limit Exceeded'
					: raw.status === 'runtimeError'
						? 'Runtime Error'
						: normaliseOutput(raw.stdout) === normaliseOutput(test.expected)
							? 'Accepted'
							: 'Wrong Answer';
			return { test, raw, verdict };
		})
	);
	for (const verdict of VERDICT_PRECEDENCE) {
		const first = outcomes.find((o) => o.verdict === verdict);
		if (!first) continue;
		const { test, raw } = first;
		const failure: SubmitFailure =
			test.problemId !== problemId
				? { kind: 'earlierStep', problemId: test.problemId, problemTitle: titleOf(test.problemId) }
				: test.kind === 'hidden'
					? { kind: 'hidden', problemId }
					: {
							kind: 'example',
							name: test.name,
							input: test.input,
							expected: test.expected,
							actual: raw.stdout,
							stderr: raw.stderr
						};
		return { verdict, failure, failingProblemId: test.problemId };
	}
	return { verdict: 'Accepted' };
}
