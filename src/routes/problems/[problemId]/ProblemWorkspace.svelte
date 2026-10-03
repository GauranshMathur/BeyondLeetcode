<script lang="ts">
import { onDestroy } from 'svelte';
import { deserialize } from '$app/forms';
import CodeEditor from '$lib/editor/CodeEditor.svelte';
import type { ProblemView } from '$lib/server/learning/core';

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
let state = $state<SaveState>('saved');
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let dirty = false;

function onchange(next: Record<string, string>) {
	if (state === 'conflict') return;
	files = next;
	dirty = true;
	state = 'edited';
	clearTimeout(timer);
	timer = setTimeout(save, SAVE_DELAY_MS);
}

const RETRY_DELAY_MS = 5 * SAVE_DELAY_MS;
// svelte-ignore state_referenced_locally
const saveUrl = `/problems/${problem.id}?/save`;
let closed = false;

async function save(keepalive = false) {
	if (inFlight || !dirty || state === 'conflict') return;
	inFlight = true;
	dirty = false;
	state = 'saving';
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
			state = 'conflict';
		} else if (response.status >= 400 && response.status < 500) {
			// The server will never accept this Build (too large, bad path): retrying cannot help.
			state = 'rejected';
		} else {
			const result = deserialize(await response.text());
			if (result.type !== 'success') throw new Error('save failed');
			revision = (result.data as { revision: number }).revision;
			state = dirty ? 'edited' : 'saved';
		}
	} catch {
		dirty = true;
		retry = true;
		state = 'failed';
	} finally {
		inFlight = false;
	}
	// Edits made while saving, or a transient failure, go out on the next tick.
	if (dirty && !closed && state !== 'conflict' && state !== 'rejected') {
		clearTimeout(timer);
		timer = setTimeout(save, retry ? RETRY_DELAY_MS : 0);
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

<svelte:window onpagehide={flush} />

<div class="pane">
	<div class="bar">
		<span class="mono file">{paths.length === 1 ? paths[0] : 'Build'}</span>
		<span class="mono status" class:warn={state === 'conflict' || state === 'failed' || state === 'rejected'} role="status">{label[state]}</span>
	</div>
	<CodeEditor files={problem.files} {onchange} readonly={state === 'conflict'} />
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
		font-family: var(--font-mono);
	}
	.status {
		color: var(--muted);
	}
	.status.warn {
		color: var(--accent);
	}
</style>
