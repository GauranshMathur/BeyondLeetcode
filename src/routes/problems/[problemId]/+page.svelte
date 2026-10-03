<script lang="ts">
import type { PageProps } from './$types';
import ProblemWorkspace from './ProblemWorkspace.svelte';

let { data }: PageProps = $props();
const problem = $derived(data.problem);
</script>

<svelte:head>
	<title>{problem.title} · BeyondLeetcode</title>
</svelte:head>

<div class="page">
	<section class="statement" aria-label="Problem">
		<nav class="crumbs" aria-label="Breadcrumb">
			<a href="/">map</a><span aria-hidden="true">›</span><a href="/topics/{problem.topicId}">{problem.topicTitle}</a>
		</nav>
		<div class="head">
			<span class="mono muted">{problem.kind === 'Core' ? 'core' : 'extra'} · {problem.topicTitle}</span>
			<h1>{problem.title}</h1>
		</div>
		<div class="prose">{@html problem.statementHtml}</div>

		{#each problem.exampleTests as test, i (test.name)}
			<div class="example">
				<span class="label mono">Example {i + 1}</span>
				<pre class="mono"><span class="muted">Input</span>
{test.input}<span class="muted">Output</span>
{test.expected}</pre>
			</div>
		{/each}

		<p class="mono muted id">{problem.id}</p>
	</section>

	{#key problem.id}
		<ProblemWorkspace {problem} />
	{/key}
</div>

<style>
	.page {
		display: grid;
		grid-template-columns: minmax(0, 560px) minmax(0, 1fr);
		min-height: calc(100vh - 80px);
	}
	.statement {
		box-sizing: border-box;
		padding: 36px 40px;
		border-right: 1px solid var(--ink);
		display: flex;
		flex-direction: column;
		gap: 24px;
		min-width: 0;
	}
	.mono {
		font-family: 'IBM Plex Mono', monospace;
	}
	.muted {
		color: var(--muted);
	}
	.crumbs {
		display: flex;
		gap: 10px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 13px;
		color: var(--muted);
	}
	.crumbs a {
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
	.prose {
		font-size: 19px;
		line-height: 1.6;
		color: var(--body);
	}
	.prose :global(p) {
		margin: 0 0 1em;
	}
	.prose :global(code) {
		font-family: 'IBM Plex Mono', monospace;
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
	.example {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.label {
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	pre {
		margin: 0;
		padding: 16px 20px;
		background: var(--panel);
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
		font-size: 13px;
		line-height: 1.7;
		color: var(--ink);
		white-space: pre-wrap;
		overflow-x: auto;
	}
	.id {
		margin: 0;
		padding-top: 12px;
		border-top: 1px solid var(--rule);
		font-size: 13px;
	}
	@media (max-width: 900px) {
		.page {
			grid-template-columns: minmax(0, 1fr);
		}
		.statement {
			border-right: 0;
			border-bottom: 1px solid var(--ink);
		}
	}
</style>
