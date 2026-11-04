<script lang="ts">
import type { ProblemView, SolutionView } from '#lib/server/learning/core.js';
import ProblemHead from './ProblemHead.svelte';

let { problem, solution }: { problem: ProblemView; solution: SolutionView } = $props();
</script>

<section class="solution" aria-label="Solution">
	<ProblemHead {problem} title="Solution" intro="Open to read at any time. Nothing is locked." />
	<div class="approach">
		<h2 class="mono label">Approach</h2>
		<div class="prose">{@html solution.explanationHtml}</div>
	</div>
</section>

<style>
	.solution {
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
	.approach {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 16px;
		border-top: 1px solid var(--ink);
	}
	.label {
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
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
</style>
