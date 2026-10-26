<script lang="ts">
import type { ProblemView, SolutionView } from '#lib/server/learning/core.js';

let { problem, solution }: { problem: ProblemView; solution: SolutionView } = $props();
</script>

<section class="solution" aria-label="Solution">
	<div class="head">
		<span class="mono muted">{problem.kind === 'Core' ? 'core' : 'extra'} · {problem.topicTitle}</span>
		<h1>Solution</h1>
		<p class="intro">Open to read at any time. Nothing is locked.</p>
	</div>
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
