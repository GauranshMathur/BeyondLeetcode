<script lang="ts">
import type { ActionResult } from '@sveltejs/kit';
import { onDestroy, type Snippet, untrack } from 'svelte';
import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import CodeEditor from '$lib/editor/CodeEditor.svelte';
import { LANGUAGES, type Language, languageById } from '$lib/languages';
import { type Reply, toReply } from '$lib/problem-wire';
import type { ProblemView, SolutionView } from '$lib/server/learning/core';
import ResultsPanel from './ResultsPanel.svelte';
import SolutionCode from './SolutionCode.svelte';
import { begin, type Event, isBusy, type Request, type SaveState, transition } from './workspace';

let {
	problem,
	statement,
	solution
}: {
	problem: ProblemView;
	statement: Snippet;
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
	dispatch({ type: 'response', reply: await post(request) });
}

async function post(request: Request): Promise<Reply> {
	try {
		const body = new FormData();
		if (request.kind === 'switch') {
			body.set('language', request.language);
		} else {
			body.set('files', JSON.stringify(request.files));
			body.set('build', JSON.stringify(request.build));
		}
		const action = request.kind === 'switch' ? 'switchLanguage' : request.kind;
		const response = await fetch(`/problems/${session.build.problemId}?/${action}`, {
			method: 'POST',
			body,
			keepalive: request.kind !== 'switch' && request.keepalive === true,
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

const busy = $derived(isBusy(session));
const paths = $derived(Object.keys(problem.files));

// The Language picker: a pick waits for the inline confirm; switching saves first, then reloads the Problem.
const nameOf = (id: string) => languageById(id)?.name ?? id;
let picked = $state<Language | undefined>(undefined);
const choice = $derived(picked ?? problem.build.language);
const confirming = $derived(choice !== problem.build.language);

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

<div class="page">
	<header class="workspace-bar">
		<div class="left">
			<a class="brand" href="/">BLC</a>
			<nav class="crumbs" aria-label="Breadcrumb">
				<a href="/">map</a><span aria-hidden="true">›</span><a href="/topics/{problem.topicId}">{problem.topicTitle}</a>
			</nav>
		</div>
		<div class="actions">
			<button type="button" class="run mono" disabled={busy} onclick={() => dispatch({ type: 'run' })}>{session.outcome?.kind === 'running' ? 'Running…' : 'Run'}</button>
			<button type="button" class="run submit mono" disabled={busy} onclick={() => dispatch({ type: 'submit' })}>{session.outcome?.kind === 'submitting' ? 'Submitting…' : 'Submit'}</button>
		</div>
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
					<p class="signed-out" role="alert">You are signed out. <a href="/sign-in">Sign in again</a> to keep working; your code is still here.</p>
				{/if}
				<CodeEditor files={problem.files} {onchange} readonly={session.save === 'conflict' || session.switching} />
				<ResultsPanel outcome={session.outcome} />
			</div>
		</div>
	</div>
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
	@media (max-width: 900px) {
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
</style>
