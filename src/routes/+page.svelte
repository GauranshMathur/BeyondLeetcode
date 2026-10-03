<script lang="ts">
import TopicMap from '$lib/map/TopicMap.svelte';
import type { PageProps } from './$types';

let { data }: PageProps = $props();
const current = $derived(data.map.topics.find((t) => t.id === data.map.currentTopicId));
</script>

<svelte:head>
	<title>Map · BeyondLeetcode</title>
</svelte:head>

<main>
	<section class="intro">
		<div class="lead">
			<span class="eyebrow">Map</span>
			<h1>Every topic, in the order it builds.</h1>
		</div>
		{#if current}
			<a class="current" href="/topics/{current.id}">
				<span class="eyebrow accent">Current topic</span>
				<span class="name">{current.title}</span>
				<span class="muted">{current.coreSolved} of {current.coreTotal} problems solved</span>
				<span class="go">Continue →</span>
			</a>
		{/if}
	</section>

	<figure>
		<TopicMap map={data.map} />
		<figcaption>
			<span class="fig">Fig. M</span>
			<span>A topic unlocks when the topics it builds on are done. Select any open topic to see its chapters and problems.</span>
		</figcaption>
	</figure>
</main>

<style>
	main {
		padding: 64px clamp(16px, 6.7vw, 96px);
	}
	.intro {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		column-gap: 32px;
		row-gap: 32px;
		align-items: end;
	}
	.lead {
		grid-column: span 8;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.eyebrow {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.eyebrow.accent {
		color: var(--accent);
	}
	h1 {
		margin: 0;
		font-weight: 400;
		font-size: clamp(36px, 4.5vw, 64px);
		line-height: 1.04;
		letter-spacing: -0.015em;
	}
	.current {
		display: flex;
		flex-direction: column;
		grid-column: 9 / span 4;
		gap: 10px;
		padding: 24px;
		background: var(--panel);
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
		color: var(--ink);
		text-decoration: none;
	}
	.current .eyebrow {
		font-size: 12px;
	}
	.name {
		font-size: 30px;
		line-height: 1.2;
	}
	.muted,
	.go {
		font-family: var(--font-mono);
		font-size: 13px;
	}
	.muted {
		color: var(--muted);
	}
	.go {
		font-size: 14px;
		font-weight: 500;
	}
	figure {
		margin: 40px 0 0;
		padding: 32px 24px 24px;
		background: var(--panel);
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
		display: flex;
		flex-direction: column;
		gap: 24px;
		overflow-x: auto;
	}
	figcaption {
		display: flex;
		gap: 20px;
		align-items: baseline;
		padding: 0 24px;
		font-size: 17px;
		line-height: 1.5;
		color: var(--body);
	}
	.fig {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink);
		white-space: nowrap;
	}
	@media (max-width: 900px) {
		.lead,
		.current {
			grid-column: 1 / -1;
		}
	}
</style>
