// k6 2.4.0 script: Learners submitting at once to a Runner, over its HTTP port (POST /execute).
// Run it with scripts/load/run.sh, which builds the submissions file and mounts it.
// It reports counts and times and fails only on a broken answer (see outcome.js); it holds no
// threshold on a time, a rate or a busy count. Nothing from a request or a response is kept.
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';
import { classifyAnswer, finishSubmission, nextStep, pickSubmission } from './outcome.js';

const RUNNER_URL = __ENV.RUNNER_URL;
const RUNNER_TOKEN = __ENV.RUNNER_TOKEN;
const SLOTS = Number(__ENV.LOAD_SLOTS);
const CLASS_SIZE = Number(__ENV.LOAD_CLASS_SIZE || '20');
if (!RUNNER_URL || !RUNNER_TOKEN) throw new Error('RUNNER_URL and RUNNER_TOKEN are required');
if (!Number.isInteger(SLOTS) || SLOTS < 1)
	throw new Error('LOAD_SLOTS must be a whole number >= 1');
if (!Number.isInteger(CLASS_SIZE) || CLASS_SIZE < 1) {
	throw new Error('LOAD_CLASS_SIZE must be a whole number >= 1');
}

// The file is {maxQueued, queueWaitMs, submissions}. A SharedArray must hold an array, so the
// submissions are one and the figures about them another, both made from one parse.
let parsed;
function load() {
	if (!parsed) {
		const file = JSON.parse(open(__ENV.LOAD_SUBMISSIONS));
		const problems = new Set(file.submissions.map((s) => s.problemId));
		const languages = [...new Set(file.submissions.map((s) => s.language))];
		parsed = {
			submissions: file.submissions,
			facts: [
				{
					maxQueued: file.maxQueued,
					queueWaitMs: file.queueWaitMs,
					count: file.submissions.length,
					problems: problems.size,
					languages
				}
			]
		};
	}
	return parsed;
}
const submissions = new SharedArray('submissions', () => load().submissions);
const facts = new SharedArray('facts', () => load().facts)[0];
if (submissions.length === 0) throw new Error('The submissions file holds no Submission');

const SCENARIOS = ['single', 'class', 'sustained'];
const VERDICTS = ['clean', 'runtimeError', 'timeLimit', 'compileError'];
const REASONS = ['noAnswer', 'otherStatus', 'notJson', 'badShape', 'badTests'];

const failed = new Counter('load_failed');
const counters = {};
const trends = {};
for (const s of SCENARIOS) {
	counters[s] = {
		started: new Counter(`load_${s}_started`),
		busy: new Counter(`load_${s}_busy`),
		unavailable: new Counter(`load_${s}_unavailable`)
	};
	for (const v of VERDICTS) counters[s][v] = new Counter(`load_${s}_finished_${v}`);
	for (const r of REASONS) counters[s][r] = new Counter(`load_${s}_failed_${r}`);
	trends[s] = {
		wait: new Trend(`load_${s}_wait_ms`, true),
		busyWait: new Trend(`load_${s}_busy_wait_ms`, true),
		end: new Trend(`load_${s}_end_ms`, true)
	};
}
const callTime = {};
const callCount = {};
for (const language of facts.languages) {
	callTime[language] = new Trend(`load_call_ms_${language}`, true);
	callCount[language] = new Counter(`load_calls_${language}`);
}

// Every Submission of a scenario ends, or is cut off by the scenario's graceful stop, within
// these. The gaps between starts leave at least 30 s after the longest the earlier one can run.
const SCENARIO_RUN = '2m';
const SCENARIO_STOP = '2m';

export const options = {
	summaryTrendStats: ['min', 'med', 'p(95)', 'max'],
	scenarios: {
		single: {
			executor: 'per-vu-iterations',
			exec: 'single',
			vus: 1,
			iterations: 6,
			maxDuration: SCENARIO_RUN,
			gracefulStop: SCENARIO_STOP,
			startTime: '0s'
		},
		class: {
			executor: 'per-vu-iterations',
			exec: 'classRoom',
			vus: CLASS_SIZE,
			iterations: 1,
			maxDuration: SCENARIO_RUN,
			gracefulStop: SCENARIO_STOP,
			startTime: '4m30s'
		},
		sustained: {
			executor: 'constant-vus',
			exec: 'sustained',
			vus: SLOTS + facts.maxQueued,
			duration: '3m',
			gracefulStop: SCENARIO_STOP,
			startTime: '9m'
		}
	},
	// The one threshold: no answer outside a full result or a clean busy refusal.
	thresholds: { load_failed: ['count==0'] }
};

// A counter nobody touched is left out of k6's summary, so each starts at 0.
export function setup() {
	failed.add(0);
	for (const s of SCENARIOS) {
		for (const counter of Object.values(counters[s])) counter.add(0);
	}
	for (const counter of Object.values(callCount)) counter.add(0);
}

/**
 * One iteration is one Submission: its calls in order, each sent once, stopping where the
 * Learning core stops.
 * @param {string} scenario
 */
function submit(scenario) {
	const c = counters[scenario];
	const t = trends[scenario];
	const scenarioStart = new Date(exec.scenario.startTime).getTime();
	const entry = pickSubmission(submissions, exec.scenario.iterationInTest);
	c.started.add(1);
	const submissionStart = Date.now();
	const results = [];
	for (let i = 0; i < entry.calls.length; i++) {
		const call = entry.calls[i];
		const sent = Date.now();
		const res = http.post(`${RUNNER_URL}/execute`, JSON.stringify(call), {
			headers: { Authorization: `Bearer ${RUNNER_TOKEN}`, 'Content-Type': 'application/json' },
			timeout: '120s',
			tags: { name: 'execute' }
		});
		const answered = Date.now();
		const out = classifyAnswer(call, {
			status: res.status,
			body: typeof res.body === 'string' ? res.body : null,
			errorCode: res.error_code
		});
		if (out.kind === 'failed') {
			c[out.reason].add(1);
			failed.add(1);
			break;
		}
		if (out.kind === 'busy') {
			c.busy.add(1);
			t.busyWait.add(answered - sent);
			break;
		}
		callTime[entry.language].add(res.timings.duration);
		callCount[entry.language].add(1);
		results.push(out.result);
		const step = nextStep(i, out.result);
		if (step.stop) {
			finish(scenario, step.end, submissionStart, answered, scenarioStart);
			return;
		}
	}
	if (results.length === entry.calls.length) {
		finish(scenario, finishSubmission(results), submissionStart, Date.now(), scenarioStart);
	} else {
		t.end.add(Date.now() - scenarioStart);
	}
}

function finish(scenario, end, submissionStart, answered, scenarioStart) {
	const c = counters[scenario];
	const t = trends[scenario];
	if (end === 'unavailable') c.unavailable.add(1);
	else {
		c[end].add(1);
		t.wait.add(answered - submissionStart);
	}
	t.end.add(answered - scenarioStart);
}

export function single() {
	submit('single');
}
export function classRoom() {
	submit('class');
}
export function sustained() {
	submit('sustained');
}

function count(data, name) {
	return data.metrics[name]?.values.count ?? 0;
}

function stats(data, name) {
	const v = data.metrics[name]?.values;
	if (!v || v.max === undefined) return null;
	return { p50: v.med, p95: v['p(95)'], max: v.max };
}

const ms = (x) => (x === undefined ? '-' : `${Math.round(x)} ms`);
const statCells = (s) => (s ? `${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.max)}` : '- | - | -');

function markdown(data) {
	const lines = ['# Load test summary', ''];
	lines.push(
		'## Scenarios',
		'',
		'| Scenario | Started | Finished | Finished per minute | Refused busy | Unavailable | Failed | Interrupted | Wait p50 | Wait p95 | Wait max |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	);
	for (const s of SCENARIOS) {
		const n = (suffix) => count(data, `load_${s}_${suffix}`);
		const done = VERDICTS.reduce((sum, v) => sum + n(`finished_${v}`), 0);
		const fails = REASONS.reduce((sum, r) => sum + n(`failed_${r}`), 0);
		const started = n('started');
		const interrupted = started - done - n('busy') - n('unavailable') - fails;
		const span = stats(data, `load_${s}_end_ms`)?.max;
		const perMinute = span ? ((done / span) * 60000).toFixed(1) : '-';
		lines.push(
			`| ${s} | ${started} | ${done} | ${perMinute} | ${n('busy')} | ${n('unavailable')} | ${fails} | ${interrupted} | ${statCells(stats(data, `load_${s}_wait_ms`))} |`
		);
	}
	lines.push(
		'',
		'Wait is from a Submission’s first call to its last answer, for finished Submissions only. Finished per minute is over the scenario’s running time.',
		'',
		'## Finished by Verdict, and failed by reason',
		'',
		`| Scenario | ${VERDICTS.join(' | ')} | ${REASONS.join(' | ')} |`,
		`| --- | ${[...VERDICTS, ...REASONS].map(() => '---').join(' | ')} |`
	);
	for (const s of SCENARIOS) {
		const cells = [
			...VERDICTS.map((v) => count(data, `load_${s}_finished_${v}`)),
			...REASONS.map((r) => count(data, `load_${s}_failed_${r}`))
		];
		lines.push(`| ${s} | ${cells.join(' | ')} |`);
	}
	lines.push(
		'',
		'## Wait until a busy refusal',
		'',
		'The refused call’s own time from send to answer.',
		'',
		'| Scenario | Refusals | p50 | p95 | max |',
		'| --- | --- | --- | --- | --- |'
	);
	for (const s of SCENARIOS) {
		lines.push(
			`| ${s} | ${count(data, `load_${s}_busy`)} | ${statCells(stats(data, `load_${s}_busy_wait_ms`))} |`
		);
	}
	lines.push(
		'',
		'## Call time per Language',
		'',
		'Each answered call (200), queue wait included.',
		'',
		'| Language | Calls | p50 | p95 | max |',
		'| --- | --- | --- | --- | --- |'
	);
	for (const language of facts.languages) {
		const name = `load_call_ms_${language}`;
		lines.push(
			`| ${language} | ${count(data, `load_calls_${language}`)} | ${statCells(stats(data, name))} |`
		);
	}
	lines.push(
		'',
		'## Inputs',
		'',
		`- Runner slots (S): ${SLOTS}`,
		`- Queue: up to ${facts.maxQueued} waiting, each for up to ${facts.queueWaitMs} ms`,
		`- Class size: ${CLASS_SIZE}`,
		`- Submissions in the file: ${facts.count}`,
		`- Distinct Problems sent: ${facts.problems}`,
		`- Failed answers in the run: ${count(data, 'load_failed')}`,
		''
	);
	return lines.join('\n');
}

export function handleSummary(data) {
	const text = markdown(data);
	return {
		'/out/summary.json': JSON.stringify(data, null, 2),
		'/out/summary.md': text,
		stdout: text
	};
}
