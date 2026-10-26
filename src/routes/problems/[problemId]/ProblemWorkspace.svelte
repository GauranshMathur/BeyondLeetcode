<script lang="ts">
import type { ActionResult } from '@sveltejs/kit';
import { onDestroy, type Snippet, untrack } from 'svelte';
import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import CodeEditor from '$lib/editor/CodeEditor.svelte';
import { LANGUAGES, type Language, languageById } from '$lib/languages';
import { filesDigest, type Reply, toReply } from '$lib/problem-wire';
import type { ProblemView, SolutionView } from '$lib/server/learning/core';
import ResultsPanel from './ResultsPanel.svelte';
import SolutionCode from './SolutionCode.svelte';
import { begin, type Event, isBusy, type Request, type SaveState, transition } from './workspace';

let {
	problem,
	statement,
	tab = $bindable('problem'),
	solution
}: {
	problem: ProblemView;
	statement: Snippet;
	/** The phone tab, held by the page so it survives the remount a language switch causes. */
	tab?: (typeof TABS)[number]['id'];
	/** While set, the Reference Code replaces the editor. The editor stays mounted, so the Learner's code and any pending save are untouched. */
	solution?: SolutionView;
} = $props();

// The state machine in ./workspace.ts owns the Build, its revision and every transition. This component
// renders it, runs the timer and the fetch it asks for, and feeds each answer back as an event. It is keyed
// by Problem and Language, so the session is started once from the first `problem`.
let session = $state.raw(untrack(() => begin(problem.build, problem.files)));
let timer: ReturnType<typeof setTimeout> | undefined;

function dispatch(event: Event) {
	const step = transition(session, event);
	session = step.state;
	if (step.timer) {
		clearTimeout(timer);
		if (step.timer !== 'cancel')
			timer = setTimeout(() => dispatch({ type: 'tick' }), step.timer.afterMs);
	}
	if (step.send) void perform(step.send);
}

/** The one place that talks to the server: posts the request and reports what came back. */
async function perform(request: Request) {
	// The unload keepalive save rides on top of the save already on the wire: that save owns the
	// session's answer, so this one's reply (if the page is still there to see it) is not fed back.
	if ('inflightDigest' in request && request.inflightDigest !== undefined) {
		await post(request);
		return;
	}
	// The digest is async and a page that is unloading cannot wait for it, so it is computed as the
	// request goes out and kept in the session for a flush to use.
	if ('files' in request && !request.keepalive) {
		const files = request.files;
		void filesDigest(files).then((digest) => dispatch({ type: 'digest', of: files, digest }));
	}
	dispatch({ type: 'response', reply: await post(request) });
}

const ACTION: Partial<Record<Request['kind'], string>> = {
	switch: 'switchLanguage',
	restart: 'startFromReferenceCode'
};

async function post(request: Request): Promise<Reply> {
	try {
		const body = new FormData();
		if (request.kind === 'switch') {
			body.set('language', request.language);
		} else {
			if (request.kind !== 'restart') body.set('files', JSON.stringify(request.files));
			if ('inflightDigest' in request && request.inflightDigest !== undefined)
				body.set('inflightDigest', request.inflightDigest);
			body.set('build', JSON.stringify(request.build));
		}
		const action = ACTION[request.kind] ?? request.kind;
		const response = await fetch(`/problems/${session.build.problemId}?/${action}`, {
			method: 'POST',
			body,
			keepalive: 'keepalive' in request && request.keepalive === true,
			headers: { 'x-sveltekit-action': 'true' }
		});
		// A redirect or proxy page is not an action's JSON; the contract reads the status either way.
		let result: ActionResult | undefined;
		try {
			result = deserialize(await response.text());
		} catch {}
		const reply = toReply(response, result);
		if (reply.ok && request.kind === 'switch') await invalidateAll();
		return reply;
	} catch {
		return { ok: false, kind: 'unreachable' };
	}
}

// Below 768px (767.98px and under) the workspace shows one pane at a time. The current tab is view state only: every pane stays
// mounted (the editor is hidden by CSS, never destroyed), so unsaved code and the state machine are untouched.
const TABS = [
	{ id: 'problem', name: 'Problem' },
	{ id: 'code', name: 'Code' },
	{ id: 'tests', name: 'Tests' }
] as const;
// When a Run or Submit answer arrives, show it. Compared by identity so edits and other session changes leave the tab alone.
let seenOutcome = untrack(() => session.outcome);
$effect(() => {
	const outcome = session.outcome;
	if (outcome === seenOutcome) return;
	seenOutcome = outcome;
	if (outcome && outcome.kind !== 'running' && outcome.kind !== 'submitting') tab = 'tests';
});

const busy = $derived(isBusy(session));
const paths = $derived(Object.keys(problem.files));

// The Language picker: a pick waits for the inline confirm; switching saves first, then reloads the Problem.
const nameOf = (id: string) => languageById(id)?.name ?? id;
let picked = $state<Language | undefined>(undefined);
const choice = $derived(picked ?? problem.build.language);
const confirming = $derived(choice !== problem.build.language);

// Start from reference code: the same inline confirm; the Learner's Submissions are kept.
let confirmingRestart = $state(false);
const restartLocked = $derived(
	busy ||
		session.switching ||
		session.restarting ||
		session.save === 'conflict' ||
		session.save === 'signedOut'
);

function onchange(files: Record<string, string>) {
	dispatch({ type: 'edit', files });
}

function onkeydown(event: KeyboardEvent) {
	if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
		// Capture phase: the editor's own Mod-Enter (insert blank line) must not see it.
		event.preventDefault();
		event.stopPropagation();
		dispatch({ type: 'run' });
	}
}

// Leaving the page (navigation, reload, close) sends what is pending and stops the timers.
onDestroy(() => dispatch({ type: 'flush', final: true }));

const label: Record<SaveState, string> = {
	saved: 'saved',
	edited: 'edited',
	saving: 'saving…',
	failed: 'not saved · retrying',
	rejected: 'not saved — this code cannot be stored',
	conflict: 'edited elsewhere — reload',
	signedOut: 'not saved — signed out'
};
</script>

<svelte:window onpagehide={() => dispatch({ type: 'flush', final: false })} onkeydowncapture={onkeydown} />

{#snippet runAndSubmit()}
	<button type="button" class="run mono" disabled={busy} onclick={() => dispatch({ type: 'run' })}>{session.outcome?.kind === 'running' ? 'Running…' : 'Run'}</button>
	<button type="button" class="run submit mono" disabled={busy} onclick={() => dispatch({ type: 'submit' })}>{session.outcome?.kind === 'submitting' ? 'Submitting…' : 'Submit'}</button>
{/snippet}

<div class="page" data-tab={tab}>
	<header class="workspace-bar">
		<div class="left">
			<a class="brand" href="/">BLC</a>
			<nav class="crumbs" aria-label="Breadcrumb">
				<a href="/">map</a><span aria-hidden="true">›</span><a href="/topics/{problem.topicId}">{problem.topicTitle}</a>
			</nav>
		</div>
		<div class="actions bar-actions">{@render runAndSubmit()}</div>
	</header>

	<div class="grid">
		{@render statement()}

		<div class="pane">
			{#if solution}
				<SolutionCode {solution} startLanguage={problem.build.language} />
			{/if}
			<div class="build" class:off={solution !== undefined}>
				<div class="bar">
					<span class="mono file">{paths.length === 1 ? paths[0] : 'Build'}</span>
					<div class="bar-right">
						<span class="mono status" class:warn={session.save === 'conflict' || session.save === 'failed' || session.save === 'rejected' || session.save === 'signedOut'} role="status">{label[session.save]}</span>
						<label class="mono picker">build language
							<select value={choice} onchange={(e) => (picked = e.currentTarget.value as Language)} aria-describedby={confirming ? 'switch-note' : undefined} disabled={session.switching}>
								{#each LANGUAGES as language (language.id)}
									<option value={language.id}>{language.name}</option>
								{/each}
							</select>
						</label>
					</div>
				</div>
				{#if confirming}
					<div class="confirm" role="group" aria-label="Switch build language">
						<div class="confirm-text">
							<span class="mono ask">Switch to {nameOf(choice)}?</span>
							<span id="switch-note" class="note">Starts a new {nameOf(choice)} copy of this build; it {problem.seedNotes[choice]}. Your {nameOf(problem.build.language)} build is kept.{session.switchFailed ? ' The switch did not go through; try again.' : ''}</span>
						</div>
						<div class="confirm-actions">
							<button type="button" class="cancel mono" onclick={() => (picked = undefined)} disabled={session.switching}>Cancel</button>
							<button type="button" class="run mono" onclick={() => dispatch({ type: 'switch', language: choice })} disabled={session.switching || busy}>{session.switching ? 'Switching…' : 'Switch language'}</button>
						</div>
					</div>
				{/if}
				{#if session.save === 'signedOut'}
					<p class="signed-out" role="alert">You are signed out. <a href="/signin">Sign in again</a> to keep working; your code is still here.</p>
				{/if}
				<div class="reference">
					<span id="ref-help" class="mono help">Replaces your code for this step with the known-good build after the previous Problem (empty on a Topic's first Problem). Your submissions are kept.{session.restartFailed ? ' It did not go through; try again.' : ''}</span>
					<button type="button" class="run mono" aria-describedby="ref-help" disabled={restartLocked || confirmingRestart} onclick={() => (confirmingRestart = true)}>Start from reference code</button>
				</div>
				{#if confirmingRestart}
					<div class="confirm" role="group" aria-label="Start from reference code">
						<div class="confirm-text">
							<span class="mono ask">Start from reference code?</span>
							<span id="restart-note" class="note">Your code for this step is replaced with the reference code. It cannot be undone; your submissions and progress are kept.</span>
						</div>
						<div class="confirm-actions">
							<button type="button" class="cancel mono" onclick={() => (confirmingRestart = false)}>Cancel</button>
							<button type="button" class="run mono" aria-describedby="restart-note" disabled={restartLocked} onclick={() => { confirmingRestart = false; dispatch({ type: 'restart' }); }}>Replace my code</button>
						</div>
					</div>
				{/if}
				{#key session.restarts}
					<CodeEditor files={session.files} {onchange} readonly={session.save === 'conflict' || session.switching || session.restarting} />
				{/key}
				<!-- Phones only, on the Tests tab: the save status and sign-in notice that the hidden Code-tab bar would show. -->
				<div class="tests-notice">
					<span class="mono status" class:warn={session.save === 'conflict' || session.save === 'failed' || session.save === 'rejected' || session.save === 'signedOut'} role="status">{label[session.save]}</span>
					{#if session.save === 'signedOut'}
						<p class="signed-out" role="alert">You are signed out. <a href="/signin">Sign in again</a> to keep working; your code is still here.</p>
					{/if}
				</div>
				<ResultsPanel outcome={session.outcome} />
			</div>
		</div>
	</div>

	<!-- Phones only: the same Run and Submit, above the tab bar. -->
	<div class="actions strip">{@render runAndSubmit()}</div>
	<nav class="tabbar mono" aria-label="Workspace">
		{#each TABS as t (t.id)}
			<button type="button" aria-pressed={tab === t.id} onclick={() => (tab = t.id)}>{t.name}</button>
		{/each}
	</nav>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}
	.workspace-bar {
		height: 64px;
		flex-shrink: 0;
		box-sizing: border-box;
		display: flex;
		justify-content: space-between;
		align-items: center;
		/* The 1px top padding offsets the bottom border so the 44px buttons clear the 64px bar by 10px each side. */
		padding: 1px 32px 0;
		border-bottom: 1px solid var(--ink);
	}
	.left {
		display: flex;
		gap: 28px;
		align-items: center;
	}
	.brand {
		color: var(--ink);
		font-family: var(--font-sans);
		font-weight: 600;
		font-size: 18px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-decoration: none;
		padding: 10px 0;
	}
	.crumbs {
		display: flex;
		gap: 10px;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--muted);
	}
	.crumbs a {
		color: var(--muted);
	}
	.grid {
		flex-grow: 1;
		display: grid;
		grid-template-columns: minmax(0, 560px) minmax(0, 1fr);
		min-height: 0;
	}
	.pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
	}
	.build {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		min-height: 0;
		min-width: 0;
	}
	.build.off {
		display: none;
	}
	.bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 24px;
		height: 48px;
		border-bottom: 1px solid var(--rule);
		font-size: 13px;
	}
	.bar-right {
		display: flex;
		gap: 20px;
		align-items: center;
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
	.confirm {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 24px;
		padding: 16px 24px;
		border-bottom: 1px solid var(--ink);
	}
	.confirm-text {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ask {
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink);
	}
	.note {
		font-size: 16px;
		line-height: 1.5;
		color: var(--body);
	}
	.confirm-actions {
		display: flex;
		gap: 20px;
		align-items: center;
		flex-shrink: 0;
	}
	.signed-out {
		margin: 0;
		padding: 16px 24px;
		border-bottom: 1px solid var(--ink);
		font-size: 16px;
		line-height: 1.5;
		color: var(--body);
	}
	.signed-out a {
		color: var(--ink);
	}
	.tests-notice {
		display: none;
	}
	.reference {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 24px;
		padding: 12px 24px;
		border-bottom: 1px solid var(--rule);
	}
	.reference .run {
		flex-shrink: 0;
	}
	.help {
		font-size: 13px;
		line-height: 1.5;
		color: var(--muted);
	}
	.cancel {
		padding: 12px 0;
		line-height: 20px;
		background: transparent;
		border: 0;
		border-radius: 2px;
		color: var(--ink);
		font-size: 14px;
		cursor: pointer;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.file {
		color: var(--ink);
	}
	.status {
		color: var(--muted);
	}
	.actions {
		display: flex;
		gap: 12px;
	}
	.submit:not(:disabled) {
		background: var(--ink);
		color: var(--paper);
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
	.run:disabled {
		color: var(--muted);
		border-color: var(--muted);
		cursor: default;
	}
	.status.warn {
		color: var(--accent);
	}
	.strip,
	.tabbar {
		display: none;
	}
	/* Wide screens: the workspace is exactly one screen tall and each pane scrolls on its own. */
	@media (min-width: 901px) {
		.page {
			height: 100dvh;
			min-height: 0;
			overflow: hidden;
		}
		.grid {
			grid-template-rows: minmax(0, 1fr);
		}
		.pane,
		.build {
			overflow: hidden;
		}
		/* The editor takes what the rows around it leave; CodeMirror's scroller does the scrolling. */
		.pane :global(.editor) {
			min-height: 0;
		}
	}
	@media (width > 767.98px) and (width <= 900px) {
		.workspace-bar {
			height: auto;
			min-height: 64px;
			flex-wrap: wrap;
			gap: 0 16px;
			padding: 1px 16px 0;
		}
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	/* Phones: one pane at a time between the 56px bar and the strip and tab bar; the document never scrolls. */
	@media (max-width: 767.98px) {
		.page {
			height: 100dvh;
			min-height: 0;
			overflow: hidden;
		}
		.workspace-bar {
			height: 56px;
			min-height: 0;
			flex-wrap: nowrap;
			padding: 0 20px;
		}
		.workspace-bar .left {
			flex-grow: 1;
			justify-content: space-between;
			gap: 16px;
		}
		.brand {
			padding: 12px 0;
		}
		.crumbs {
			align-items: center;
			gap: 8px;
			font-size: 12px;
			line-height: 20px;
		}
		.crumbs :global(a),
		.crumbs span {
			padding: 12px 0;
		}
		.bar-actions {
			display: none;
		}
		.grid {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr);
		}
		.pane {
			overflow: hidden;
		}
		.build {
			overflow-y: auto;
		}
		.pane :global(.editor) {
			min-height: 320px;
		}
		/* Hide, never destroy: the editor keeps its state while another tab shows. */
		.page:not([data-tab='problem']) .grid > :global(.left),
		.page[data-tab='problem'] .pane {
			display: none;
		}
		.page[data-tab='tests'] .build > :global(:not(.console, .tests-notice)),
		.page[data-tab='code'] .build > :global(.console) {
			display: none;
		}
		.page[data-tab='tests'] .tests-notice {
			display: block;
			flex-shrink: 0;
			border-bottom: 1px solid var(--ink);
		}
		.page[data-tab='tests'] .tests-notice .status {
			display: block;
			padding: 12px 20px;
		}
		.page[data-tab='tests'] .tests-notice .signed-out {
			border-bottom: 0;
		}
		.page[data-tab='tests'] .build {
			overflow: hidden;
		}
		/* While the Solution is open the editor is off; the Tests tab still shows the console, and only it. */
		.page[data-tab='tests'] .pane > :global(:not(.build)) {
			display: none;
		}
		.page[data-tab='tests'] .build.off {
			display: flex;
		}
		.page[data-tab='tests'] .build > :global(.console) {
			flex: 1 1 0;
			max-height: none;
			border-top: 0;
			min-height: 0;
		}
		.bar {
			flex-direction: column;
			align-items: stretch;
			gap: 16px;
			height: auto;
			padding: 16px 20px;
		}
		.bar-right {
			flex-direction: column;
			align-items: stretch;
			gap: 16px;
		}
		.status {
			order: -1;
		}
		.picker {
			flex-direction: column;
			align-items: stretch;
			gap: 8px;
			font-size: 13px;
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
		.confirm,
		.signed-out,
		.reference {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
			padding: 16px 20px;
		}
		.confirm-actions {
			justify-content: space-between;
		}
		.cancel {
			min-height: 44px;
			padding: 12px 8px;
		}
		.strip {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			column-gap: 12px;
			flex-shrink: 0;
			padding: 12px 20px;
			border-top: 1px solid var(--rule);
		}
		.strip .run {
			padding: 0;
		}
		.tabbar {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			flex-shrink: 0;
			border-top: 1px solid var(--ink);
			font-size: 13px;
		}
		.tabbar button {
			height: 56px;
			box-sizing: border-box;
			background: transparent;
			border: 0;
			border-top: 2px solid transparent;
			color: var(--muted);
			font: inherit;
			cursor: pointer;
		}
		.tabbar button[aria-pressed='true'] {
			color: var(--ink);
			border-top-color: var(--accent);
		}
	}
</style>
