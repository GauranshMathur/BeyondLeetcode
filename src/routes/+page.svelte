<script lang="ts">
import TopicMap from '$lib/map/TopicMap.svelte';
import type { PageProps } from './$types';

let { data }: PageProps = $props();
const current = $derived(data.map.topics.find((t) => t.id === data.map.currentTopicId));
const titleById = $derived(new Map(data.map.topics.map((t) => [t.id, t.title])));
const BAR_WIDTH = 112;

function after(prerequisites: readonly string[]): string {
	return prerequisites.map((id) => titleById.get(id) ?? id).join(', ');
}

function stateText(t: (typeof data.map.topics)[number]): string {
	const count = `${t.coreSolved}/${t.coreTotal}`;
	if (t.id === data.map.currentTopicId && t.state !== 'locked') return `current · ${count}`;
	return t.state === 'complete' ? `done · ${count}` : `${count} solved`;
}
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
		<div class="graph"><TopicMap map={data.map} /></div>
		<ol class="column" aria-label="Topics in build order">
			{#each data.map.topics as t (t.id)}
				{#snippet body()}
					<span class="title">{t.title}</span>
					{#if t.state === 'locked'}
						<span class="state">locked</span>
					{:else}
						<span class="state">
							<span class="bar" aria-hidden="true">
								<span
									class="fill"
									style:width="{t.coreTotal ? (BAR_WIDTH * t.coreSolved) / t.coreTotal : 0}px"
								></span>
							</span>
							{stateText(t)}
						</span>
					{/if}
					{#if t.prerequisites.length > 0}
						<span class="state">after {after(t.prerequisites)}</span>
					{/if}
				{/snippet}
				<li>
					{#if t.state === 'locked'}
						<div class="box locked">{@render body()}</div>
					{:else}
						<a
							class="box {t.state}"
							class:current={t.id === data.map.currentTopicId}
							href="/topics/{t.id}"
						>
							{@render body()}
						</a>
					{/if}
				</li>
			{/each}
		</ol>
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
	.column {
		display: none;
	}
	@media (max-width: 767.98px) {
		main {
			padding: 24px 20px 32px;
		}
		.intro {
			grid-template-columns: minmax(0, 1fr);
			row-gap: 24px;
			align-items: start;
		}
		.lead,
		.current {
			grid-column: 1 / -1;
		}
		.lead {
			gap: 12px;
		}
		.eyebrow {
			font-size: 12px;
		}
		h1 {
			font-size: 30px;
			line-height: 1.15;
		}
		.current {
			padding: 20px;
			gap: 10px;
			min-height: 44px;
		}
		.name {
			line-height: 1.15;
		}
		figure {
			margin: 24px 0 0;
			padding: 0;
			background: none;
			border: 0;
			overflow-x: visible;
		}
		.graph {
			display: none;
		}
		.column {
			display: flex;
			flex-direction: column;
			gap: 12px;
			margin: 0;
			padding: 0;
			list-style: none;
		}
		.box {
			display: flex;
			flex-direction: column;
			gap: 6px;
			box-sizing: border-box;
			min-height: 44px;
			padding: 14px 16px;
			border: 1px solid var(--ink);
			background: var(--paper);
			color: var(--ink);
			text-decoration: none;
			font-family: var(--font-mono);
		}
		.box .title {
			font-size: 15px;
			font-weight: 500;
			overflow-wrap: anywhere;
		}
		.box .state {
			display: flex;
			align-items: center;
			gap: 12px;
			font-size: 12px;
			color: var(--muted);
		}
		.bar {
			flex-shrink: 0;
			box-sizing: border-box;
			width: 112px;
			height: 6px;
			border: 1px solid var(--ink);
			border-radius: 2px;
			overflow: hidden;
		}
		.fill {
			display: block;
			height: 100%;
			background: var(--ink);
		}
		.box.complete {
			background: var(--ink);
			color: var(--on-ink);
		}
		.box.complete .state {
			color: var(--on-ink);
		}
		.box.complete .bar {
			border-color: var(--on-ink);
		}
		.box.complete .fill {
			background: var(--on-ink);
		}
		.box.current {
			padding: 13px 15px;
			border: 2px solid var(--accent);
		}
		.box.current .title {
			color: var(--accent);
		}
		.box.locked {
			background: transparent;
			border: 1px dashed var(--muted);
			color: var(--muted);
		}
		figcaption {
			flex-direction: column;
			gap: 8px;
			padding: 0;
			font-size: 16px;
		}
	}
</style>
