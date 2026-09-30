<script lang="ts">
import type { MapView } from '$lib/server/learning/core';
import { layoutMap, NODE_HEIGHT, NODE_WIDTH } from './layout.ts';

let { map }: { map: MapView } = $props();

const layout = $derived(layoutMap(map.topics));
const stateById = $derived(new Map(map.topics.map((t) => [t.id, t.state])));
const BAR_WIDTH = 112;

/** Elbow line from a Prerequisite down to its Topic, as on the canvas. */
function path(e: { x1: number; y1: number; x2: number; y2: number }): string {
	const mid = (e.y1 + e.y2) / 2;
	return `M${e.x1},${e.y1} V${mid} H${e.x2} V${e.y2}`;
}
</script>

<svg
	viewBox="0 0 {layout.width} {layout.height}"
	width={layout.width}
	height={layout.height}
	role="group"
	aria-label="Topic map"
>
	{#each layout.edges as edge (`${edge.from}>${edge.to}`)}
		<path
			class="edge"
			class:locked={stateById.get(edge.to) === 'locked'}
			d={path(edge)}
			fill="none"
		/>
	{/each}

	{#each layout.nodes as { topic, x, y } (topic.id)}
		{@const label = `${topic.title}, ${topic.state}, ${topic.coreSolved} of ${topic.coreTotal} core problems solved`}
		{#snippet node()}
			<rect
				class="box {topic.state}"
				class:current={topic.id === map.currentTopicId}
				{x}
				{y}
				width={NODE_WIDTH}
				height={NODE_HEIGHT}
			/>
			<svg x={x + 16} {y} width={NODE_WIDTH - 32} height={NODE_HEIGHT}>
				<text class="title {topic.state}" y="30">{topic.title}</text>
			</svg>
			{#if topic.state === 'locked'}
				<text class="count" x={x + 16} y={y + 51}>locked</text>
			{:else}
				<rect class="bar {topic.state}" x={x + 16.5} y={y + 44.5} width={BAR_WIDTH} height="6" rx="2" />
				{#if topic.coreSolved > 0}
					<rect
						class="fill {topic.state}"
						x={x + 16.5}
						y={y + 44.5}
						width={topic.coreTotal ? (BAR_WIDTH * topic.coreSolved) / topic.coreTotal : 0}
						height="6"
						rx="2"
					/>
				{/if}
				<text class="count {topic.state}" x={x + 140} y={y + 51}>
					{topic.coreSolved}/{topic.coreTotal}
				</text>
			{/if}
		{/snippet}

		{#if topic.state === 'locked'}
			<g role="img" aria-label={label}>{@render node()}</g>
		{:else}
			<a class="node" href="/topics/{topic.id}" aria-label={label}>{@render node()}</a>
		{/if}
	{/each}
</svg>

<style>
	svg {
		display: block;
		margin: 0 auto;
		font-family: 'IBM Plex Mono', monospace;
	}
	.edge {
		stroke: var(--ink);
		stroke-width: 1.25;
	}
	.edge.locked {
		stroke: var(--muted);
		stroke-dasharray: 5 4;
	}
	.box {
		fill: var(--paper);
		stroke: var(--ink);
		stroke-width: 1.25;
	}
	.box.complete {
		fill: var(--ink);
	}
	.box.locked {
		/* Opaque, so a line to a Topic further down passes behind this node, not through it. */
		fill: var(--paper);
		stroke: var(--muted);
		stroke-dasharray: 5 4;
	}
	.box.current {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.title {
		font-size: 15px;
		font-weight: 500;
		fill: var(--ink);
	}
	.title.complete {
		fill: var(--on-ink);
	}
	.title.locked {
		fill: var(--muted);
	}
	.count {
		font-size: 12px;
		fill: var(--muted);
	}
	.count.complete {
		fill: var(--on-ink);
	}
	.bar {
		fill: none;
		stroke: var(--ink);
		stroke-width: 1;
	}
	.bar.complete {
		stroke: var(--on-ink);
	}
	.fill {
		fill: var(--ink);
	}
	.fill.complete {
		fill: var(--on-ink);
	}
	.node {
		outline: none;
	}
	.node:focus-visible .box {
		stroke: var(--accent);
		stroke-width: 3;
	}
	.node:hover .box {
		stroke-width: 2;
	}
</style>
