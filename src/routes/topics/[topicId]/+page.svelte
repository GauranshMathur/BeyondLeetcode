<script lang="ts">
import type { PageProps } from './$types';

let { data }: PageProps = $props();
const topic = $derived(data.topic);
const counts = $derived(topic.counts);
const titles = $derived(
	new Map(topic.chapters.flatMap((c) => c.problems).map((p) => [p.id, p.title]))
);
const pct = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0);
</script>

<svelte:head>
	<title>{topic.title} · BeyondLeetcode</title>
</svelte:head>

<main>
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/">map</a><span aria-hidden="true">›</span><span aria-current="page">{topic.id}</span>
	</nav>

	<section class="head">
		<div class="lead">
			<span class="eyebrow">Topic · {counts.chaptersTotal} {counts.chaptersTotal === 1 ? 'chapter' : 'chapters'}</span>
			<h1>{topic.title}</h1>
		</div>

		<aside aria-label="Topic progress">
			<div class="bar-row">
				<div class="line"><span class="muted">chapters read</span><span>{counts.chaptersRead} of {counts.chaptersTotal}</span></div>
				<div class="bar" aria-hidden="true"><div style="width: {pct(counts.chaptersRead, counts.chaptersTotal)}%"></div></div>
			</div>
			<div class="bar-row">
				<div class="line"><span class="muted">core solved</span><span>{counts.coreSolved} of {counts.coreTotal}</span></div>
				<div class="bar" aria-hidden="true"><div style="width: {pct(counts.coreSolved, counts.coreTotal)}%"></div></div>
			</div>
			<div class="bar-row extra">
				<div class="line"><span class="muted">extra solved · not counted</span><span class="muted">{counts.extraSolved} of {counts.extraTotal}</span></div>
				<div class="bar muted-bar" aria-hidden="true"><div style="width: {pct(counts.extraSolved, counts.extraTotal)}%"></div></div>
			</div>
			<p class="rule-note muted">Complete when every chapter is read and every core problem is solved. Extra problems are optional.</p>
		</aside>
	</section>

	{#each topic.chapters as chapter, i (chapter.id)}
		<section class="chapter" aria-labelledby="ch-{chapter.id}">
			<div class="num">§{i + 1}</div>
			<div class="body">
				<div class="chapter-head">
					<div>
						<span class="mono muted">chapter {i + 1}</span>
						<h2 id="ch-{chapter.id}"><a href="/chapters/{chapter.id}">{chapter.title}</a></h2>
					</div>
					<span class="read mono">
						<span class="marker" class:filled={chapter.read} aria-hidden="true"></span>{chapter.read ? 'read' : 'not read'}
					</span>
				</div>

				{#if chapter.problems.length > 0}
					<table>
						<thead>
							<tr>
								<th scope="col">problem</th>
								<th scope="col">set</th>
								<th scope="col" class="status">status</th>
							</tr>
						</thead>
						<tbody>
							{#each chapter.problems as problem (problem.id)}
								<tr>
									<td class="title"><a class="ptitle" href="/problems/{problem.id}">{problem.title}</a></td>
									<td>
										{#if problem.kind === 'Core'}
											<span class="core">core</span>
										{:else}
											<span class="muted upper">extra</span>
											{#if problem.parentProblemId}
												<span class="muted">· off {titles.get(problem.parentProblemId) ?? problem.parentProblemId}</span>
											{/if}
										{/if}
									</td>
									<td class="status muted">{problem.status === 'Untouched' ? '—' : problem.status.toLowerCase()}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</section>
	{/each}
</main>

<style>
	main {
		padding: 56px clamp(16px, 6.7vw, 96px) 96px;
	}
	.mono,
	.eyebrow,
	.crumbs,
	aside,
	table {
		font-family: var(--font-mono);
	}
	.muted {
		color: var(--muted);
	}
	.crumbs {
		display: flex;
		gap: 10px;
		font-size: 13px;
		color: var(--muted);
		padding-bottom: 48px;
	}
	.crumbs a {
		color: var(--muted);
	}
	.crumbs [aria-current] {
		color: var(--ink);
	}
	.head {
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
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	h1 {
		margin: 0;
		font-weight: 400;
		font-size: clamp(40px, 5.3vw, 76px);
		line-height: 1.02;
		letter-spacing: -0.015em;
	}
	aside {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding-top: 16px;
		border-top: 1px solid var(--ink);
		font-size: 13px;
		grid-column: 10 / span 3;
	}
	.bar-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.bar-row.extra {
		padding-top: 14px;
		border-top: 1px solid var(--rule);
	}
	.line {
		display: flex;
		justify-content: space-between;
	}
	.bar {
		height: 8px;
		box-sizing: border-box;
		border: 1px solid var(--ink);
		border-radius: 2px;
		overflow: hidden;
	}
	.bar div {
		height: 100%;
		background: var(--ink);
	}
	.bar.muted-bar {
		border-color: var(--muted);
	}
	.bar.muted-bar div {
		background: var(--muted);
	}
	.rule-note {
		margin: 0;
		padding-top: 14px;
		border-top: 1px solid var(--rule);
		line-height: 1.6;
	}
	.chapter {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		column-gap: 32px;
		padding-top: 112px;
	}
	.num {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		padding-top: 10px;
		grid-column: span 2;
	}
	.body {
		grid-column: 3 / span 10;
		display: flex;
		flex-direction: column;
		gap: 32px;
		min-width: 0;
	}
	.chapter-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 32px;
	}
	.chapter-head > div {
		display: flex;
		flex-direction: column;
		gap: 14px;
		max-width: 680px;
	}
	.chapter-head .mono {
		font-size: 13px;
	}
	h2 {
		margin: 0;
		font-weight: 400;
		font-size: clamp(30px, 4vw, 44px);
		line-height: 1.1;
	}
	h2 a {
		color: var(--ink);
		text-decoration: none;
	}
	h2 a:hover,
	.ptitle:hover {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-underline-offset: 6px;
	}
	.read {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 13px;
		white-space: nowrap;
	}
	.marker {
		width: 10px;
		height: 10px;
		box-sizing: border-box;
		border: 1px solid var(--ink);
	}
	.marker.filled {
		background: var(--ink);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	th {
		text-align: left;
		padding: 0 16px 12px 0;
		font-weight: 500;
		color: var(--muted);
		border-bottom: 1px solid var(--ink);
	}
	td {
		padding: 20px 16px 20px 0;
		border-bottom: 1px solid var(--rule);
	}
	tr:last-child td {
		border-bottom-color: var(--ink);
	}
	td.title {
		padding-top: 10px;
		padding-bottom: 10px;
	}
	.status {
		text-align: right;
		padding-right: 0;
	}
	.ptitle {
		color: var(--ink);
		font-family: var(--font-serif);
		font-size: 21px;
		text-decoration: none;
		display: inline-block;
		padding: 10px 0;
	}
	.core {
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-bottom: 2px solid var(--ink);
		padding-bottom: 2px;
	}
	.crumbs a {
		/* 44px target without growing the row. */
		display: inline-block;
		padding: 12px 0;
		margin: -12px 0;
		line-height: 20px;
	}
	.upper {
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	@media (max-width: 900px) {
		.head,
		.chapter {
			grid-template-columns: minmax(0, 1fr);
		}
		.lead,
		aside,
		.num,
		.body {
			grid-column: 1 / -1;
		}
		.chapter {
			padding-top: 64px;
			row-gap: 16px;
		}
	}
</style>
