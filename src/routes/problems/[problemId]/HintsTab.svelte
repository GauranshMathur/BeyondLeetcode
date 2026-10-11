<script lang="ts">
import { enhance } from '$app/forms';
import type { ReplyData } from '$lib/problem-wire';
import type { HintsView, ProblemView } from '$lib/server/learning/core';

let { problem, hints }: { problem: ProblemView; hints: HintsView } = $props();

// A reveal answers with the new view, so the tab updates in place without reloading the Problem
// (which would hand the editor a stale copy of the code). A page load brings the stored state back.
let revealed = $state.raw<HintsView | undefined>(undefined);
let revealing = $state(false);
const view = $derived(revealed ?? hints);
const next = $derived(view.revealed.length + 1);
const unrevealed = $derived(Array.from({ length: view.total - next }, (_, i) => next + 1 + i));
</script>

<section class="hints" aria-label="Hints">
	<div class="head">
		<span class="mono muted">{problem.kind === 'Core' ? 'core' : 'extra'} · {problem.topicTitle}</span>
		<h1>Hints</h1>
		<p class="intro">Hints are free. Reveal one at a time, in order. Each links back to the chapter behind the idea.</p>
	</div>

	{#if view.total === 0}
		<p class="none">No hints for this problem.</p>
	{:else}
		<div class="list">
			{#each view.revealed as hint (hint.number)}
				<article class="hint" aria-labelledby="hint-{hint.number}">
					<h2 id="hint-{hint.number}" class="mono label">Hint {hint.number} of {view.total}</h2>
					<div class="prose">{@html hint.html}</div>
					<a class="chapter mono" href="/chapters/{view.chapter.id}"><span class="muted">Chapter ·</span><span class="name">{view.chapter.title}</span><span aria-hidden="true">→</span></a>
				</article>
			{/each}

			{#if next <= view.total}
				<form
					class="row"
					method="POST"
					action="?tab=hints&/revealHint"
					use:enhance={() => {
						revealing = true;
						return async ({ result }) => {
							revealing = false;
							if (result.type === 'success') revealed = (result.data as ReplyData['revealHint']).hints;
						};
					}}
				>
					<span class="mono label">Hint {next} of {view.total}</span>
					<button type="submit" class="mono button" disabled={revealing}>Reveal hint {next}</button>
				</form>
				{#each unrevealed as number (number)}
					<div class="row locked">
						<span class="mono label muted">Hint {number} of {view.total} · not revealed</span>
					</div>
				{/each}
			{/if}
			<div class="end"></div>
		</div>
	{/if}
</section>

<style>
	.hints {
		box-sizing: border-box;
		padding: 36px 40px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		min-width: 0;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.muted {
		color: var(--muted);
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 12px;
		font-size: 13px;
	}
	h1 {
		margin: 0;
		font-weight: 400;
		font-size: 38px;
		line-height: 1.12;
	}
	.intro {
		margin: 0;
		font-size: 17px;
		line-height: 1.5;
		color: var(--body);
	}
	.none {
		margin: 0;
		font-size: 17px;
		color: var(--body);
	}
	.list {
		display: flex;
		flex-direction: column;
	}
	.hint {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 20px 0 22px;
		border-top: 1px solid var(--ink);
	}
	.label {
		margin: 0;
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink);
	}
	.label.muted {
		color: var(--muted);
	}
	.prose {
		font-size: 19px;
		line-height: 1.6;
		color: var(--body);
	}
	.prose :global(p) {
		margin: 0 0 1em;
	}
	.prose :global(p:last-child) {
		margin-bottom: 0;
	}
	.prose :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
	.prose :global(pre) {
		margin: 0 0 1em;
		padding: 16px 20px;
		background: var(--panel);
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
		overflow-x: auto;
	}
	.chapter {
		display: inline-flex;
		gap: 10px;
		align-items: baseline;
		align-self: flex-start;
		padding: 6px 0;
		color: var(--ink);
		text-decoration: none;
		font-size: 13px;
		line-height: 1.5;
	}
	.chapter .name {
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 5px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 24px;
		min-height: 44px;
		padding: 14px 0;
		border-top: 1px solid var(--rule);
	}
	.button {
		flex-shrink: 0;
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
	.button:disabled {
		color: var(--muted);
		border-color: var(--muted);
		cursor: default;
	}
	.end {
		border-top: 1px solid var(--rule);
	}
</style>
