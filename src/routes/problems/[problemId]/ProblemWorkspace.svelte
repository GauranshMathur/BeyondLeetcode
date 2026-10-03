<script lang="ts">
import { onDestroy, type Snippet } from 'svelte';
import { deserialize } from '$app/forms';
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
let saveState = $state<SaveState>('saved');
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let dirty = false;
let outcome = $state<Outcome | undefined>(undefined);
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
				<span class="mono status" class:warn={saveState === 'conflict' || saveState === 'failed' || saveState === 'rejected'} role="status">{label[saveState]}</span>
			</div>
			<CodeEditor files={problem.files} {onchange} readonly={saveState === 'conflict'} />
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
