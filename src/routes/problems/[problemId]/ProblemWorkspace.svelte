<script lang="ts">
import { onDestroy } from 'svelte';
import { deserialize } from '$app/forms';
import CodeEditor from '$lib/editor/CodeEditor.svelte';
import type { ProblemView, RunView } from '$lib/server/learning/core';
import type { Outcome } from './outcome';
import ResultsPanel from './ResultsPanel.svelte';

let { problem }: { problem: ProblemView } = $props();

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
const running = $derived(outcome?.kind === 'running');

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

/** Run saves the Build itself, so it waits for an autosave in flight and holds the next one off. */
async function run() {
	if (running || saveState === 'conflict' || saveState === 'rejected') return;
	outcome = { kind: 'running' };
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
		const response = await fetch(runUrl, {
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
				const view = result.data as unknown as RunView;
				revision = view.revision;
				saveState = dirty ? 'edited' : 'saved';
				outcome = { kind: 'result', view };
			} else {
				throw new Error('run failed');
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

<div class="pane">
	<div class="bar">
		<span class="mono file">{paths.length === 1 ? paths[0] : 'Build'}</span>
		<span class="mono status" class:warn={saveState === 'conflict' || saveState === 'failed' || saveState === 'rejected'} role="status">{label[saveState]}</span>
		<button type="button" class="run mono" disabled={running} onclick={run}>{running ? 'Running…' : 'Run'}</button>
	</div>
	<CodeEditor files={problem.files} {onchange} readonly={saveState === 'conflict'} />
	<ResultsPanel {outcome} />
</div>

<style>
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
		font-family: 'IBM Plex Mono', monospace;
	}
	.status {
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
	.run:disabled {
		color: var(--muted);
		border-color: var(--muted);
		cursor: default;
	}
	.status.warn {
		color: var(--accent);
	}
</style>
