import { LANGUAGE_IDS, type Language } from '../../languages.ts';
import type { Catalogue } from '../content/catalogue.ts';
import { sandboxConfig } from '../runner/config.ts';
import type { ExecuteRequest } from '../runner/port.ts';
import { batchRequest, submitPlan } from '../submit-plan.ts';

/** The Runner requests one Submission sends, in the order it sends them. */
export interface LoadSubmission {
	readonly problemId: string;
	readonly language: Language;
	readonly calls: readonly ExecuteRequest[];
}

/**
 * What a load test sends the Runner: the requests a Learner's Submission of each Problem's
 * Reference Code makes, in every Language, planned and built by the same code the Learning core
 * uses. No expected output is in the result; the queue limits come from `sandboxConfig`.
 */
export function runnerSubmissions(
	catalogue: Catalogue,
	hiddenBatchTests: number = sandboxConfig.hiddenBatchTests
): { maxQueued: number; queueWaitMs: number; submissions: LoadSubmission[] } {
	const limits = { timeoutMs: sandboxConfig.testTimeoutMs, memoryMb: sandboxConfig.memoryMb };
	const submissions: LoadSubmission[] = [];
	for (const { id: topicId } of catalogue.topicMap()) {
		for (const chapter of catalogue.topic(topicId)?.chapters ?? []) {
			for (const { id: problemId } of chapter.problems) {
				const plan = submitPlan(catalogue, problemId, hiddenBatchTests);
				const problem = catalogue.problem(problemId);
				if (!plan || !problem) throw new Error(`Problem ${problemId} is listed but not loaded`);
				const batches = [...(plan.visible.length > 0 ? [plan.visible] : []), ...plan.hidden];
				for (const language of LANGUAGE_IDS) {
					submissions.push({
						problemId,
						language,
						calls: batches.map((tests) =>
							batchRequest(language, problem.referenceCode[language], tests, limits)
						)
					});
				}
			}
		}
	}
	return {
		maxQueued: sandboxConfig.maxQueued,
		queueWaitMs: sandboxConfig.queueWaitMs,
		submissions
	};
}
