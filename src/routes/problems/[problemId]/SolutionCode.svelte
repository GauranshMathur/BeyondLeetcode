<script lang="ts">
import CodeEditor from '$lib/editor/CodeEditor.svelte';
import { LANGUAGES, type Language } from '$lib/languages';
import type { SolutionView } from '$lib/server/learning/core';

let { solution, startLanguage }: { solution: SolutionView; startLanguage: Language } = $props();

// Which Reference Code to show. Independent of the Build's Language; it starts on it.
// svelte-ignore state_referenced_locally
let shown = $state<Language>(startLanguage);
</script>

<div class="viewer">
	<div class="bar">
		<nav class="switch mono" aria-label="Reference code language">
			{#each LANGUAGES as language (language.id)}
				<button type="button" aria-current={shown === language.id ? 'true' : undefined} onclick={() => (shown = language.id)}>{language.name}</button>
			{/each}
		</nav>
		<span class="mono note">reference code · read only</span>
	</div>
	{#key shown}
		<CodeEditor files={{ ...solution.referenceCode[shown] }} onchange={() => {}} readonly />
	{/key}
</div>

<style>
	.viewer {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
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
	.switch {
		display: flex;
		gap: 28px;
	}
	.switch button {
		background: none;
		border: 0;
		border-bottom: 2px solid transparent;
		color: var(--muted);
		font: inherit;
		padding: 14px 0 12px;
		cursor: pointer;
	}
	.switch button[aria-current='true'] {
		color: var(--ink);
		border-bottom-color: var(--accent);
	}
	.note {
		color: var(--muted);
	}
	.mono {
		font-family: var(--font-mono);
	}
</style>
