<script lang="ts">
import { reportIssueUrl } from '$lib/issue-link';
import type { PageProps } from './$types';
import HintsTab from './HintsTab.svelte';
import ProblemWorkspace from './ProblemWorkspace.svelte';

let { data }: PageProps = $props();
const problem = $derived(data.problem);
</script>

<svelte:head>
	<title>{problem.title} · BeyondLeetcode</title>
</svelte:head>

{#key `${problem.id}:${problem.build.language}`}
	<ProblemWorkspace {problem}>
		{#snippet statement()}
			<div class="left">
				<nav class="tabs mono" aria-label="Problem sections">
					<a href="/problems/{problem.id}" data-sveltekit-noscroll aria-current={data.tab === 'problem' ? 'page' : undefined}>Problem</a>
					<a href="/problems/{problem.id}?tab=hints" data-sveltekit-noscroll aria-current={data.tab === 'hints' ? 'page' : undefined}>Hints</a>
				</nav>
				{#if data.tab === 'hints' && data.hints}
					<HintsTab {problem} hints={data.hints} />
				{:else}
					<section class="statement" aria-label="Problem">
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

						<div class="idrow">
							<p class="mono muted id">{problem.id}</p>
							<a class="report mono" href={reportIssueUrl('Problem', problem.title, problem.id)} target="_blank" rel="noopener noreferrer">Report an issue<span aria-hidden="true">↗</span><span class="sr-only">(opens GitHub in a new tab)</span></a>
						</div>
					</section>
				{/if}
			</div>
		{/snippet}
	</ProblemWorkspace>
{/key}

<style>
	.left {
		border-right: 1px solid var(--ink);
		min-width: 0;
	}
	.tabs {
		display: flex;
		gap: 28px;
		padding: 0 40px;
		border-bottom: 1px solid var(--rule);
		font-size: 13px;
	}
	.tabs a {
		color: var(--muted);
		padding: 16px 0 14px;
		text-decoration: none;
		border-bottom: 2px solid transparent;
	}
	.tabs a[aria-current='page'] {
		color: var(--ink);
		border-bottom-color: var(--accent);
	}
	.statement {
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
	.prose {
		font-size: 19px;
		line-height: 1.6;
		color: var(--body);
	}
	.prose :global(p) {
		margin: 0 0 1em;
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
	.idrow {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-top: 1px solid var(--rule);
	}
	.id {
		margin: 0;
		font-size: 13px;
	}
	.report {
		display: inline-flex;
		gap: 8px;
		align-items: center;
		padding: 14px 0;
		font-size: 13px;
		color: var(--muted);
		text-decoration: underline;
		text-decoration-color: var(--rule);
		text-decoration-thickness: 1px;
		text-underline-offset: 5px;
	}
	.report:hover,
	.report:focus-visible {
		color: var(--ink);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	@media (max-width: 900px) {
		.left {
			border-right: 0;
			border-bottom: 1px solid var(--ink);
		}
	}
</style>
