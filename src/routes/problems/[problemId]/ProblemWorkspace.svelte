<script lang="ts">
import { onDestroy, onMount, type Snippet, tick, untrack } from 'svelte';
import CodeEditor from '#lib/editor/CodeEditor.svelte';
import AppHeader from '#lib/header/AppHeader.svelte';
import { LANGUAGES, type Language, languageById } from '#lib/languages.js';
import { filesDigest, type Reply, toReply } from '#lib/problem-wire.js';
import type { ProblemView, SolutionView } from '#lib/server/learning/core.js';
import { type ActionResult, deserialize } from '$app/forms';
import { refreshAll } from '$app/navigation';
import { page } from '$app/state';
import ResultsPanel from './ResultsPanel.svelte';
import SolutionCode from './SolutionCode.svelte';
import { afterOutcome, PANES, type ViewState } from './view';
import { begin, type Event, may, type Request, type SaveState, transition } from './workspace';

let {
	problem,
	statement,
	view,
	onview,
	solution,
	claimEditorFocus,
	onswitched
}: {
	problem: ProblemView;
	statement: Snippet;
	/** The screen's view state, held by the page so the pane survives the remount a language switch causes. */
	view: ViewState;
	onview: (view: ViewState) => void;
	/** While set, the Reference Code replaces the editor. The editor stays mounted, so the Learner's code and any pending save are untouched. */
	solution?: SolutionView;
	/** Asked once on mount: true when this workspace replaces one a language switch just removed, so the editor takes focus. */
	claimEditorFocus?: (problemId: string, language: string) => boolean;
	/** A switch went through: the page remounts the workspace for the new language, which will claim focus. */
	onswitched?: (problemId?: string, language?: string) => void;
} = $props();

// The state machine in ./workspace.ts owns the Build, its revision and every transition. This component
// renders it, runs the timer and the fetch it asks for, and feeds each answer back as an event. It is keyed
// by Problem and Language, so the session is started once from the first `problem`.
let session = $state.raw(untrack(() => begin(problem.build, problem.files)));
let timer: ReturnType<typeof setTimeout> | undefined;

function dispatch(event: Event) {
	const step = transition(session, event);
	const seenOutcome = session.outcome;
	session = step.state;
	// When a Run or Submit answer arrives, show it. Compared by identity so edits and other session changes leave the pane alone.
	if (session.outcome !== seenOutcome) onview(afterOutcome(view, session.outcome));
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
		if (reply.ok && request.kind === 'switch') {
			onswitched?.(session.build.problemId, request.language);
			await refreshAll();
			// Whether or not the remount claimed it, the request is spent.
			onswitched?.();
		}
		return reply;
	} catch {
		return { ok: false, kind: 'unreachable' };
	}
}

// Below 768px (767.98px and under) the workspace shows one pane at a time. The current pane is view state only: every pane stays
// mounted (the editor is hidden by CSS, never destroyed), so unsaved code and the state machine are untouched.
const NAMES = { problem: 'Problem', code: 'Code', tests: 'Tests' } as const;

const paths = $derived(Object.keys(problem.files));

// The Language picker: a pick waits for the inline confirm; switching saves first, then reloads the Problem.
const nameOf = (id: string) => languageById(id)?.name ?? id;
let picked = $state<Language | undefined>(undefined);
const choice = $derived(picked ?? problem.build.language);
const confirming = $derived(choice !== problem.build.language);

// Start from reference code: the same inline confirm; the Learner's Submissions are kept.
let confirmingRestart = $state(false);
const allowed = $derived(may(session));

// A control that is busy or shut stays focusable (aria-disabled), so focus is never dropped onto the document;
// its click does nothing. Where a control removes itself, focus is moved on by hand to what replaces it.
let pickerEl = $state<HTMLSelectElement>();
let restartTrigger = $state<HTMLButtonElement>();
let editorSlot = $state<HTMLDivElement>();

function focusEditor() {
	editorSlot?.querySelector<HTMLElement>('.cm-content')?.focus();
}

function cancelSwitch() {
	if (session.switching) return;
	picked = undefined;
	pickerEl?.focus();
}

function cancelRestart() {
	confirmingRestart = false;
	restartTrigger?.focus();
}

function confirmRestart() {
	if (!allowed.restart) return;
	confirmingRestart = false;
	// The confirm is going; the trigger holds focus until the restart's answer remounts the editor.
	restartTrigger?.focus();
	dispatch({ type: 'restart' });
}

onMount(() => {
	if (claimEditorFocus?.(problem.id, problem.build.language)) focusEditor();
});

// A finished restart remounts the editor; focus follows it there.
let seenRestarts = untrack(() => session.restarts);
$effect(() => {
	const restarts = session.restarts;
	if (restarts === seenRestarts) return;
	seenRestarts = restarts;
	void tick().then(focusEditor);
});

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

{#snippet saveNotice(part: 'status' | 'signedOut')}
	{#if part === 'status'}
		<span class="mono status" class:warn={session.save === 'conflict' || session.save === 'failed' || session.save === 'rejected' || session.save === 'signedOut'}>{label[session.save]}</span>
		<!-- Saved, edited and saving change at every pause in typing, so they stay out of the live region. A signed-out Learner is told by the alert below. -->
		<span class="live" role="status">{session.save === 'failed' || session.save === 'conflict' ? label[session.save] : ''}</span>
	{:else if session.save === 'signedOut'}
		<p class="signed-out" role="alert">You are signed out. <a href="/signin">Sign in again</a> to keep working; your code is still here.</p>
	{/if}
{/snippet}

{#snippet runAndSubmit()}
	<button type="button" class="run mono" aria-disabled={!allowed.run} onclick={() => dispatch({ type: 'run' })}>{session.outcome?.kind === 'running' ? 'Running…' : 'Run'}</button>
	<button type="button" class="run submit mono" aria-disabled={!allowed.submit} onclick={() => dispatch({ type: 'submit' })}>{session.outcome?.kind === 'submitting' ? 'Submitting…' : 'Submit'}</button>
{/snippet}

{#snippet crumbs()}
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/">map</a><span aria-hidden="true">›</span><a href="/topics/{problem.topicId}">{problem.topicTitle}</a>
	</nav>
{/snippet}

<div class="page" data-tab={view.pane}>
	<AppHeader header={page.data.header} {crumbs} actions={runAndSubmit} />

	<main class="grid">
		<div data-pane="problem">{@render statement()}</div>

		<div class="pane">
			{#if solution}
				<div data-pane="code"><SolutionCode {solution} startLanguage={problem.build.language} /></div>
			{/if}
			<div class="build" class:off={solution !== undefined}>
				<div data-pane="code">
				<div class="bar">
					<span class="mono file">{paths.length === 1 ? paths[0] : 'Build'}</span>
					<div class="bar-right">
						{@render saveNotice('status')}
						<label class="mono picker">build language
							<select bind:this={pickerEl} value={choice} onchange={(e) => (picked = e.currentTarget.value as Language)} aria-describedby={confirming ? 'switch-note' : undefined} disabled={session.switching}>
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
							<button type="button" class="cancel mono" onclick={cancelSwitch} aria-disabled={session.switching}>Cancel</button>
							<button type="button" class="run mono" onclick={() => dispatch({ type: 'switch', language: choice })} aria-disabled={!allowed.switch}>{session.switching ? 'Switching…' : 'Switch language'}</button>
						</div>
					</div>
				{/if}
				{@render saveNotice('signedOut')}
				<div class="reference">
					<span id="ref-help" class="mono help">Replaces your code for this step with the known-good build after the previous Problem (empty on a Topic's first Problem). Your submissions are kept.{session.restartFailed ? ' It did not go through; try again.' : ''}</span>
					<button type="button" class="run mono" aria-describedby="ref-help" bind:this={restartTrigger} aria-disabled={!allowed.restart || confirmingRestart} onclick={() => { if (allowed.restart && !confirmingRestart) confirmingRestart = true; }}>Start from reference code</button>
				</div>
				{#if confirmingRestart}
					<div class="confirm" role="group" aria-label="Start from reference code">
						<div class="confirm-text">
							<span class="mono ask">Start from reference code?</span>
							<span id="restart-note" class="note">Your code for this step is replaced with the reference code. It cannot be undone; your submissions and progress are kept.</span>
						</div>
						<div class="confirm-actions">
							<button type="button" class="cancel mono" onclick={cancelRestart}>Cancel</button>
							<button type="button" class="run mono" aria-describedby="restart-note" aria-disabled={!allowed.restart} onclick={confirmRestart}>Replace my code</button>
						</div>
					</div>
				{/if}
				<div class="editor-slot" bind:this={editorSlot}>
					{#key session.restarts}
						<CodeEditor files={session.files} {onchange} readonly={allowed.readOnly} />
					{/key}
				</div>
				</div>
				<div data-pane="tests">
					<!-- Phones only, on the Tests tab: the save status and sign-in notice that the hidden Code-tab bar would show. -->
					<div class="tests-notice">
						{@render saveNotice('status')}
						{@render saveNotice('signedOut')}
					</div>
					<ResultsPanel outcome={session.outcome} />
				</div>
			</div>
		</div>
	</main>

	<!-- Phones only: the same Run and Submit, above the tab bar. -->
	<div class="actions strip">{@render runAndSubmit()}</div>
	<nav class="tabbar mono" aria-label="Workspace">
		{#each PANES as pane (pane)}
			<button type="button" aria-pressed={view.pane === pane} onclick={() => onview({ ...view, pane })}>{NAMES[pane]}</button>
		{/each}
	</nav>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
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
	/* Each pane's wrapper takes no box of its own, so the layout is the same as if its contents sat in the grid or the build. */
	[data-pane],
	.editor-slot {
		display: contents;
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
	.submit:not([aria-disabled='true']) {
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
	.run[aria-disabled='true'] {
		color: var(--muted);
		border-color: var(--muted);
		cursor: default;
	}
	.status.warn {
		color: var(--accent);
	}
	/* Read by screen readers only; the visible .status carries the same words for everyone else. */
	.live {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.strip,
	.tabbar {
		display: none;
	}
	/* Wide screens: the workspace is exactly one screen tall and each pane scrolls on its own. */
	@media (width > 900px) {
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
		.editor-slot {
			display: flex;
			flex-direction: column;
			flex: 1 1 auto;
			min-height: 0;
			--editor-min: 0;
		}
	}
	@media (width > 767.98px) and (width <= 900px) {
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
		/* Hide, never destroy: the editor keeps its state while another pane shows. */
		.page:not([data-tab='problem']) [data-pane='problem'],
		.page[data-tab='problem'] .pane,
		.page[data-tab='tests'] [data-pane='code'],
		.page[data-tab='code'] [data-pane='tests'] {
			display: none;
		}
		.page[data-tab='tests'] [data-pane='tests'] {
			display: flex;
			flex-direction: column;
			flex: 1 1 0;
			min-height: 0;
		}
		.page[data-tab='tests'] .tests-notice {
			display: block;
			flex-shrink: 0;
			border-bottom: 1px solid var(--ink);
		}
		.page[data-tab='tests'] .tests-notice .status {
			display: block;
			padding: 12px var(--size-gutter);
		}
		.page[data-tab='tests'] .tests-notice .signed-out {
			border-bottom: 0;
		}
		.page[data-tab='tests'] .build {
			overflow: hidden;
		}
		/* While the Solution is open the editor is off; the Tests pane still shows, and only it. */
		.page[data-tab='tests'] .build.off {
			display: flex;
		}
		.bar {
			flex-direction: column;
			align-items: stretch;
			gap: 16px;
			height: auto;
			padding: 16px var(--size-gutter);
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
			padding: 16px var(--size-gutter);
		}
		.confirm-actions {
			justify-content: space-between;
		}
		.cancel {
			min-height: var(--size-target);
			padding: 12px 8px;
		}
		.strip {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			column-gap: 12px;
			flex-shrink: 0;
			padding: 12px var(--size-gutter);
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
			height: var(--size-bar);
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
