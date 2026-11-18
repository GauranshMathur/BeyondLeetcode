// What the load test makes of a Runner's answers: pure functions with no k6 or Node import, so
// the k6 script and a unit test load the same file. Nothing here keeps text from an answer: a
// failure is one fixed reason word and, at most, a number.

/**
 * @typedef {{ tests: ReadonlyArray<{ id: string }> }} CallRequest
 * @typedef {{ id: string, status: 'ok' | 'runtimeError' | 'timeout', cutOff?: true }} TestOutcome
 * @typedef {{ compileError?: string, results: TestOutcome[] }} CallResult
 * @typedef {{ status: number, body: string | null, errorCode: number }} RawAnswer
 * @typedef {{ kind: 'result', result: CallResult }
 *   | { kind: 'busy' }
 *   | { kind: 'failed', reason: 'noAnswer', errorCode: number }
 *   | { kind: 'failed', reason: 'otherStatus', status: number }
 *   | { kind: 'failed', reason: 'notJson' | 'badShape' | 'badTests' }} Classified
 * @typedef {'compileError' | 'unavailable' | 'timeLimit'} StopEnd
 * @typedef {StopEnd | 'runtimeError' | 'clean'} SubmissionEnd
 */

const STATUSES = ['ok', 'runtimeError', 'timeout'];

/**
 * Whether `value` has the shape of the Runner's `executeResultSchema` (runner/port.ts): `cutOff`
 * only on a timeout, and no results beside a compile error.
 * @param {unknown} value
 * @returns {value is CallResult}
 */
function isCallResult(value) {
	if (typeof value !== 'object' || value === null) return false;
	const { compileError, results } = /** @type {Record<string, unknown>} */ (value);
	if (compileError !== undefined && typeof compileError !== 'string') return false;
	if (!Array.isArray(results)) return false;
	if (compileError !== undefined && results.length > 0) return false;
	return results.every((r) => {
		if (typeof r !== 'object' || r === null) return false;
		return (
			typeof r.id === 'string' &&
			STATUSES.includes(r.status) &&
			typeof r.stdout === 'string' &&
			typeof r.stderr === 'string' &&
			(r.cutOff === undefined || (r.cutOff === true && r.status === 'timeout'))
		);
	});
}

/**
 * Sorts one Runner answer to one request into a full result, a busy refusal or a failure.
 * @param {CallRequest} request
 * @param {RawAnswer} answer
 * @returns {Classified}
 */
export function classifyAnswer(request, answer) {
	if (answer.status === 0)
		return { kind: 'failed', reason: 'noAnswer', errorCode: answer.errorCode };
	/** @type {unknown} */
	let body;
	let json = true;
	try {
		body = JSON.parse(answer.body ?? '');
	} catch {
		json = false;
	}
	if (answer.status === 503 && json && /** @type {any} */ (body)?.error === 'Runner is busy') {
		return { kind: 'busy' };
	}
	if (answer.status !== 200)
		return { kind: 'failed', reason: 'otherStatus', status: answer.status };
	if (!json) return { kind: 'failed', reason: 'notJson' };
	if (!isCallResult(body)) return { kind: 'failed', reason: 'badShape' };
	if (body.compileError === undefined) {
		const sent = request.tests.map((t) => t.id);
		const same =
			body.results.length === sent.length && body.results.every((r, i) => r.id === sent[i]);
		if (!same) return { kind: 'failed', reason: 'badTests' };
	}
	return { kind: 'result', result: body };
}

/**
 * After a full result: whether the Submission stops, as `runSubmission` and `runBatch` in
 * learning/submission.ts stop it. The first call is the visible batch: a compile error there is
 * the Verdict Compile Error, and in a later call it is unavailable.
 * @param {number} callIndex 0 for the first call
 * @param {CallResult} result
 * @returns {{ stop: false } | { stop: true, end: StopEnd }}
 */
export function nextStep(callIndex, result) {
	if (result.results.some((r) => r.cutOff)) return { stop: true, end: 'unavailable' };
	if (result.compileError !== undefined) {
		return { stop: true, end: callIndex === 0 ? 'compileError' : 'unavailable' };
	}
	if (result.results.some((r) => r.status === 'timeout')) return { stop: true, end: 'timeLimit' };
	return { stop: false };
}

/**
 * How a Submission ends when every call has run.
 * @param {CallResult[]} results
 * @returns {'runtimeError' | 'clean'}
 */
export function finishSubmission(results) {
	return results.some((r) => r.results.some((t) => t.status === 'runtimeError'))
		? 'runtimeError'
		: 'clean';
}

const GOLDEN = 0.6180339887498949;

/**
 * Picks the entry the n-th Submission of a scenario sends. The list is Problem by Problem, each
 * Problem's Languages together (the shape of the submissions file). The Language cycles with n,
 * and the Problem steps by the golden ratio through the list, so consecutive picks lie far apart
 * in it: in different Topics, since Problems are listed Topic by Topic. No randomness, so a run
 * can be repeated.
 * @template {{ problemId: string }} T
 * @param {ArrayLike<T>} list
 * @param {number} n
 * @returns {T}
 */
export function pickSubmission(list, n) {
	let perProblem = 1;
	while (perProblem < list.length && list[perProblem].problemId === list[0].problemId) perProblem++;
	const problems = Math.floor(list.length / perProblem);
	const problem = Math.floor(((n * GOLDEN) % 1) * problems);
	return list[problem * perProblem + (n % perProblem)];
}
