<script lang="ts">
import type { ProblemView } from '#lib/server/learning/core.js';

// The head every pane of a Problem opens with: its kind and Topic, the pane's title, and an optional intro line.
let { problem, title, intro }: { problem: ProblemView; title: string; intro?: string } = $props();
</script>

<div class="head">
	<span class="mono muted">{problem.kind === 'Core' ? 'core' : 'extra'} · {problem.topicTitle}</span>
	<h1>{title}</h1>
	{#if intro}<p class="intro">{intro}</p>{/if}
</div>

<style>
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
</style>
