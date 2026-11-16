<script lang="ts">
import { LANGUAGES, type Language, languageById } from '#lib/languages.js';
import { toReply } from '#lib/problem-wire.js';
import type { ReferenceTestResult, RunTestStatus } from '#lib/server/learning/core.js';
import { type ActionResult, deserialize } from '$app/forms';

// Dev mode only: the Problem screen hands this view to the console when the layout says dev mode is on.
// It runs the Problem's Reference Code and lists one row per Test. It reads and writes nothing of the
// Learner's: the editor, the saved code, Submissions and progress are not touched.

let { problemId, startLanguage }: { problemId: string; startLanguage: Language } = $props();

const statusLabel: Record<RunTestStatus, string> = {
	passed: 'pass',
	wrongAnswer: 'fail · wrong answer',
	runtimeError: 'fail · runtime error',
	timeout: 'fail · time limit exceeded'
};

type Shown =
	| { kind: 'idle' }
	| { kind: 'running'; language: Language }
	| { kind: 'result'; language: Language; tests: readonly ReferenceTestResult[] }
	| { kind: 'unavailable' };

let language = $state<Language | undefined>(undefined);
const chosen = $derived(language ?? startLanguage);
let shown = $state<Shown>({ kind: 'idle' });
// Each run takes a number; an answer that comes back after the select changed carries an old one and is dropped.
let latest = 0;
// True from the press until the answer is back, whatever the select did meanwhile: one request at a time.
let inflight = $state(false);

const nameOf = (id: Language) => languageById(id)?.name ?? id;

function choose(id: Language) {
	language = id;
	latest += 1;
	shown = { kind: 'idle' };
}

function testsOf(data: unknown): readonly ReferenceTestResult[] | undefined {
	const tests = (data as { tests?: unknown } | null)?.tests;
	return Array.isArray(tests) ? (tests as ReferenceTestResult[]) : undefined;
}

async function run() {
	if (inflight) return;
	inflight = true;
	const asked = chosen;
	const mine = ++latest;
	shown = { kind: 'running', language: asked };
	let outcome: Shown = { kind: 'unavailable' };
	try {
		const body = new FormData();
		body.set('language', asked);
		const response = await fetch(`/problems/${problemId}?/runReference`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		let result: ActionResult | undefined;
		try {
			result = deserialize(await response.text());
		} catch {}
		const reply = toReply(response, result);
		const tests = reply.ok ? testsOf(reply.data) : undefined;
		if (tests) outcome = { kind: 'result', language: asked, tests };
	} catch {
	} finally {
		inflight = false;
	}
	if (mine === latest) shown = outcome;
}

const tests = $derived(shown.kind === 'result' ? shown.tests : []);
const passed = $derived(tests.filter((t) => t.status === 'passed').length);
const examples = $derived(tests.filter((t) => t.kind === 'example').length);
const hiddens = $derived(tests.filter((t) => t.kind === 'hidden').length);
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const words = $derived.by((): { text: string; summary?: string; mark: string } | undefined => {
	if (shown.kind === 'running') return { text: 'Running', mark: 'pending' };
	if (shown.kind === 'unavailable')
		return { text: 'Runner unavailable', summary: 'no tests ran', mark: 'fail' };
	if (shown.kind !== 'result') return undefined;
	const ok = passed === tests.length;
	return {
		text: ok ? 'Reference passed' : 'Reference failed',
		summary: `${passed} of ${tests.length} passed`,
		mark: ok ? 'ok' : 'fail'
	};
});

const label = (test: ReferenceTestResult) =>
	test.problemId === problemId ? test.name : `${test.problemId} · ${test.name}`;
const kindLabel = (test: ReferenceTestResult) => (test.kind === 'example' ? 'Example' : 'Hidden');
const rowKey = (test: ReferenceTestResult) =>
	`${test.problemId}\u0000${test.kind}\u0000${test.name}`;
</script>

<div class="dev">
	<section class="band" aria-label="Dev mode: run the reference solution">
		<div class="title">
			<span class="marker" aria-hidden="true"></span>
			<span class="label">Dev mode · reference solution</span>
		</div>
		<label class="picker mono">reference language
			<select value={chosen} onchange={(e) => choose(e.currentTarget.value as Language)}>
				{#each LANGUAGES as option (option.id)}
					<option value={option.id}>{option.name}</option>
				{/each}
			</select>
		</label>
		<span id="dev-ref-help" class="help mono">Runs the reference solution on every Test. Your code is not touched.</span>
		<button type="button" class="run mono" aria-describedby="dev-ref-help" aria-disabled={inflight} onclick={run}>{inflight ? 'Running reference…' : 'Run reference solution'}</button>
	</section>

	<div class="result">
		<!-- Always in the page, so a screen reader hears each change of its text. -->
		<div class="state mono" role="status">
			{#if words}
				<span class="mark {words.mark}" aria-hidden="true"></span>
				<span class:fail={words.mark === 'fail'}>{words.text}</span>
				{#if words.summary}<span class="muted" class:fail={words.mark === 'fail'}>{words.summary}</span>{/if}
			{/if}
		</div>

		{#if shown.kind === 'idle'}
			<p class="muted mono note">Run the reference solution to see a result for every Test.</p>
		{:else if shown.kind === 'running'}
			<div class="block mono">
				<span class="muted">language {shown.language}</span>
				<span>Waiting for the runner…</span>
			</div>
		{:else if shown.kind === 'unavailable'}
			<p class="mono fail alert" role="alert">The runner is unavailable. Try again.</p>
			<div class="block mono">
				<span><span class="muted">reference solution</span> not run</span>
				<span><span class="muted">your code</span> untouched</span>
			</div>
		{:else}
			<p class="muted mono summary">language {shown.language} · {plural(examples, 'Example Test')} · {plural(hiddens, 'Hidden Test')}</p>
			<table class="mono" aria-label="Reference solution results, {nameOf(shown.language)}">
				<thead>
					<tr><th scope="col">test</th><th scope="col">kind</th><th scope="col">result</th></tr>
				</thead>
				<tbody>
					{#each tests as test (rowKey(test))}
						<tr>
							<th scope="row">{label(test)}</th>
							<td>{kindLabel(test)}</td>
							<td class:fail={test.status !== 'passed'}>{statusLabel[test.status]}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<ol class="rows mono" aria-label="Reference solution results, {nameOf(shown.language)}">
				{#each tests as test (rowKey(test))}
					<li>
						<span class="left"><span>{label(test)}</span><span class="muted">{kindLabel(test)}</span></span>
						<span class:fail={test.status !== 'passed'}>{statusLabel[test.status]}</span>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>

<style>
	.mono {
		font-family: var(--font-mono);
		font-size: 13px;
	}
	.muted {
		color: var(--muted);
	}
	.fail {
		color: var(--accent);
	}
	.band {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 20px;
		padding: 16px 24px;
		background: var(--panel);
		border-bottom: 1px solid var(--ink);
	}
	.title {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-basis: 100%;
	}
	.label {
		font-family: var(--font-mono);
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink);
	}
	.marker {
		box-sizing: border-box;
		flex-shrink: 0;
		width: 10px;
		height: 10px;
		border: 2px solid var(--ink);
	}
	.picker {
		display: flex;
		gap: 10px;
		align-items: center;
		color: var(--muted);
	}
	.picker select {
		height: 32px;
		padding: 0 10px;
		background: var(--field);
		border: 1px solid var(--rule);
		border-radius: 2px;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 13px;
	}
	.help {
		flex: 1 1 240px;
		line-height: 1.5;
		color: var(--muted);
	}
	.run {
		height: 44px;
		padding: 0 22px;
		background: transparent;
		color: var(--ink);
		border: 1px solid var(--ink);
		border-radius: 2px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}
	.run[aria-disabled='true'] {
		color: var(--muted);
		border-color: var(--muted);
		cursor: default;
	}
	.result {
		padding: 0 24px 24px;
	}
	.state {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 20px;
		padding: 16px 0;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.mark {
		box-sizing: border-box;
		flex-shrink: 0;
		width: 10px;
		height: 10px;
		border: 2px solid var(--ink);
	}
	.mark.ok {
		background: var(--ink);
	}
	.mark.pending {
		border: 2px dashed var(--muted);
	}
	.mark.fail {
		border-color: var(--accent);
	}
	.note,
	.summary,
	.alert {
		margin: 0;
		padding-bottom: 16px;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 16px 20px;
		background: var(--panel);
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
		line-height: 1.7;
		color: var(--body);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		color: var(--body);
	}
	th,
	td {
		padding: 10px 12px 10px 0;
		text-align: left;
		font-weight: 400;
		border-bottom: 1px solid var(--rule);
	}
	thead th {
		color: var(--muted);
		border-bottom: 1px solid var(--ink);
	}
	tbody th {
		color: var(--ink);
	}
	.rows {
		display: none;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/* Phones: the rows are a list, a Test's name over its kind and the result on the right. */
	@media (max-width: 767.98px) {
		.band {
			flex-direction: column;
			align-items: stretch;
			padding: 16px var(--size-gutter);
		}
		.picker {
			flex-direction: column;
			align-items: stretch;
			gap: 8px;
			letter-spacing: 0.06em;
			text-transform: uppercase;
		}
		.picker select {
			width: 100%;
			height: 52px;
			padding: 0 16px;
			border-color: var(--ink);
			font-size: 18px;
		}
		.result {
			padding: 0 var(--size-gutter) 24px;
		}
		table {
			display: none;
		}
		.rows {
			display: block;
		}
		.rows li {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 12px;
			min-height: 44px;
			box-sizing: border-box;
			padding: 8px 0;
			border-bottom: 1px solid var(--rule);
		}
		.left {
			display: flex;
			flex-direction: column;
			min-width: 0;
			overflow-wrap: anywhere;
		}
	}
</style>
