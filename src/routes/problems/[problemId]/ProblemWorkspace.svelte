<script lang="ts">
import { onDestroy, type Snippet } from 'svelte';
import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import CodeEditor from '$lib/editor/CodeEditor.svelte';
import type { ProblemView, RunView, SubmitView } from '$lib/server/learning/core';
import type { Outcome } from './outcome';
import ResultsPanel from './ResultsPanel.svelte';

let { problem, statement }: { problem: ProblemView; statement: Snippet } = $props();

const SAVE_DELAY_MS = 1000;
type SaveState = 'saved' | 'edited' | 'saving' | 'failed' | 'rejected' | 'conflict';

// The page owns the Build and its revision from here on; the editor reports every edit.
// The Build and revision are taken once; this component is keyed by Problem, so it never goes stale.
// svelte-ignore state_referenced_locally
const paths = Object.keys(problem.files);
// svelte-ignore state_referenced_locally
let files = { ...problem.files };
// svelte-ignore state_referenced_locally
let revision = problem.revision;
// The Language this Build was loaded in: sent with every save, even if `problem` has moved on by then.
// svelte-ignore state_referenced_locally
const loadedLanguage = problem.language;
let saveState = $state<SaveState>('saved');
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let dirty = false;
let outcome = $state<Outcome | undefined>(undefined);
// The Language picker: a pick waits for the inline confirm; switching saves first, then reloads the Problem.
const LANGUAGE_NAMES = { python: 'Python', typescript: 'TypeScript', go: 'Go' } as const;
const PICKABLE = ['python', 'typescript', 'go'] as const;
// svelte-ignore state_referenced_locally
let choice = $state<string>(problem.language);
let confirming = $derived(choice !== problem.language);
let switching = $state(false);
let switchFailed = $state(false);
const busy = $derived(outcome?.kind === 'running' || outcome?.kind === 'submitting');

function onchange(next: Record<string, string>) {
	if (saveState === 'conflict') return;
	files = next;
	dirty = true;
	saveState = 'edited';
	clearTimeout(timer);
	timer = setTimeout(save, SAVE_DELAY_MS);
}

const RETRY_DELAY_MS = 5 * SAVE_DELAY_MS;
// svelte-ignore state_referenced_locally
const saveUrl = `/problems/${problem.id}?/save`;
let closed = false;

async function save(keepalive = false) {
	if (inFlight || !dirty || saveState === 'conflict') return;
	inFlight = true;
	dirty = false;
	saveState = 'saving';
	let retry = false;
	try {
		const body = new FormData();
		body.set('files', JSON.stringify(files));
		body.set('baseRevision', String(revision));
		body.set('language', loadedLanguage);
		const response = await fetch(saveUrl, {
			method: 'POST',
			body,
			keepalive,
			headers: { 'x-sveltekit-action': 'true' }
		});
		if (response.status === 409) {
			saveState = 'conflict';
		} else if (response.status >= 400 && response.status < 500) {
			// The server will never accept this Build (too large, bad path): retrying cannot help.
			saveState = 'rejected';
		} else {
			const result = deserialize(await response.text());
			if (result.type !== 'success') throw new Error('save failed');
			revision = (result.data as { revision: number }).revision;
			saveState = dirty ? 'edited' : 'saved';
		}
	} catch {
		dirty = true;
		retry = true;
		saveState = 'failed';
	} finally {
		inFlight = false;
	}
	afterSave(retry);
}

/** Edits made while saving, or a transient failure, go out on the next tick. */
function afterSave(retry: boolean) {
	if (dirty && (!closed || !retry) && saveState !== 'conflict' && saveState !== 'rejected') {
		clearTimeout(timer);
		timer = setTimeout(save, retry ? RETRY_DELAY_MS : 0);
	}
}

// svelte-ignore state_referenced_locally
const runUrl = `/problems/${problem.id}?/run`;
// svelte-ignore state_referenced_locally
const submitUrl = `/problems/${problem.id}?/submit`;

/** Run and Submit save the Build themselves, so they wait for an autosave in flight and hold the next one off. */
async function send(
	url: string,
	pending: Outcome,
	done: (data: Record<string, unknown>) => Outcome & { revision: number }
) {
	if (busy || saveState === 'conflict' || saveState === 'rejected') return;
	outcome = pending;
	clearTimeout(timer);
	while (inFlight) await new Promise((resolve) => setTimeout(resolve, 25));
	inFlight = true;
	const sent = files;
	dirty = false;
	saveState = 'saving';
	let retry = false;
	try {
		const body = new FormData();
		body.set('files', JSON.stringify(sent));
		body.set('baseRevision', String(revision));
		body.set('language', loadedLanguage);
		const response = await fetch(url, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		if (response.status === 409) {
			saveState = 'conflict';
			outcome = undefined;
		} else if (response.status >= 400 && response.status < 500) {
			saveState = 'rejected';
			outcome = undefined;
		} else {
			const result = deserialize(await response.text());
			if (result.type === 'failure' && result.status === 503) {
				// The Build was saved before the Runner failed (a failure result comes back as HTTP 200).
				if (typeof result.data?.revision === 'number') revision = result.data.revision;
				saveState = dirty ? 'edited' : 'saved';
				outcome = { kind: 'unavailable' };
			} else if (result.type === 'success') {
				const next = done(result.data as Record<string, unknown>);
				revision = next.revision;
				saveState = dirty ? 'edited' : 'saved';
				outcome = next;
			} else {
				throw new Error('request failed');
			}
		}
	} catch {
		dirty = true;
		retry = true;
		saveState = 'failed';
		outcome = undefined;
	} finally {
		inFlight = false;
	}
	afterSave(retry);
}

const run = () =>
	send(runUrl, { kind: 'running' }, (data) => {
		const view = data as unknown as RunView;
		return { kind: 'result', view, revision: view.revision };
	});

const submit = () =>
	send(submitUrl, { kind: 'submitting' }, (data) => {
		const view = data as unknown as SubmitView;
		return { kind: 'verdict', view, revision: view.revision };
	});

function onkeydown(event: KeyboardEvent) {
	if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
		// Capture phase: the editor's own Mod-Enter (insert blank line) must not see it.
		event.preventDefault();
		event.stopPropagation();
		void run();
	}
}

// Leaving the page (navigation, reload, close) sends what is pending and stops the timers.
function flush() {
	clearTimeout(timer);
	void save(true);
}
onDestroy(() => {
	flush();
	closed = true;
});

function cancelSwitch() {
	choice = problem.language;
}

async function confirmSwitch() {
	if (busy || switching) return;
	switching = true;
	switchFailed = false;
	// Nothing may save into the new Language's Build afterwards: send what is pending first.
	clearTimeout(timer);
	while (inFlight) await new Promise((resolve) => setTimeout(resolve, 25));
	await save();
	if (dirty || saveState === 'conflict' || saveState === 'rejected') {
		switching = false;
		switchFailed = true;
		return;
	}
	try {
		const body = new FormData();
		body.set('language', choice);
		const response = await fetch(`/problems/${problem.id}?/switchLanguage`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		if (deserialize(await response.text()).type !== 'success') throw new Error('switch failed');
		await invalidateAll();
	} catch {
		switchFailed = true;
	} finally {
		switching = false;
	}
}

const label: Record<SaveState, string> = {
	saved: 'saved',
	edited: 'edited',
	saving: 'saving…',
	failed: 'not saved · retrying',
	rejected: 'not saved — this code cannot be stored',
	conflict: 'edited elsewhere — reload'
};
</script>

<svelte:window onpagehide={flush} onkeydowncapture={onkeydown} />

<div class="page">
	<header class="workspace-bar">
		<div class="left">
			<a class="brand" href="/">BLC</a>
			<nav class="crumbs" aria-label="Breadcrumb">
				<a href="/">map</a><span aria-hidden="true">›</span><a href="/topics/{problem.topicId}">{problem.topicTitle}</a>
			</nav>
		</div>
		<div class="actions">
			<button type="button" class="run mono" disabled={busy} onclick={run}>{outcome?.kind === 'running' ? 'Running…' : 'Run'}</button>
			<button type="button" class="run submit mono" disabled={busy} onclick={submit}>{outcome?.kind === 'submitting' ? 'Submitting…' : 'Submit'}</button>
		</div>
	</header>

	<div class="grid">
		{@render statement()}

		<div class="pane">
			<div class="bar">
				<span class="mono file">{paths.length === 1 ? paths[0] : 'Build'}</span>
				<div class="bar-right">
					<span class="mono status" class:warn={saveState === 'conflict' || saveState === 'failed' || saveState === 'rejected'} role="status">{label[saveState]}</span>
					<label class="mono picker">build language
						<select bind:value={choice} aria-describedby={confirming ? 'switch-note' : undefined} disabled={switching}>
							{#each PICKABLE as language (language)}
								<option value={language}>{LANGUAGE_NAMES[language]}</option>
							{/each}
						</select>
					</label>
				</div>
			</div>
			{#if confirming}
				<div class="confirm" role="group" aria-label="Switch build language">
					<div class="confirm-text">
						<span class="mono ask">Switch to {LANGUAGE_NAMES[choice as keyof typeof LANGUAGE_NAMES]}?</span>
						<span id="switch-note" class="note">Starts a new {LANGUAGE_NAMES[choice as keyof typeof LANGUAGE_NAMES]} copy of this build from reference code. Your {LANGUAGE_NAMES[problem.language]} build is kept.{switchFailed ? ' The switch did not go through; try again.' : ''}</span>
					</div>
					<div class="confirm-actions">
						<button type="button" class="cancel mono" onclick={cancelSwitch} disabled={switching}>Cancel</button>
						<button type="button" class="run mono" onclick={confirmSwitch} disabled={switching || busy}>{switching ? 'Switching…' : 'Switch language'}</button>
					</div>
				</div>
			{/if}
			<CodeEditor files={problem.files} {onchange} readonly={saveState === 'conflict' || switching} />
			<ResultsPanel {outcome} />
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
