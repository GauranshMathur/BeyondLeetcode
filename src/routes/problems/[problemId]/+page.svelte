<script lang="ts">
import { reportIssueUrl } from '#lib/issue-link.js';
import type { PageProps } from './$types';
import HintsTab from './HintsTab.svelte';
import ProblemHead from './ProblemHead.svelte';
import ProblemWorkspace from './ProblemWorkspace.svelte';
import SolutionTab from './SolutionTab.svelte';
import { PANES, type Pane, type ViewState } from './view';

let { data }: PageProps = $props();
const problem = $derived(data.problem);
const problemId = $derived(data.problem.id); // a derived id only notifies when the id itself changes
// The phone's pane lives here, above the key, so a language switch (which remounts the workspace) keeps it. It is
// derived from the Problem's id, so another Problem starts on its statement; picking a pane overrides it until then.
let pane = $derived.by((): Pane => {
	problemId;
	return PANES[0];
});
const view = $derived<ViewState>({ section: data.tab, pane });
const paneLabel = { problem: 'Problem statement', hints: 'Hints', solution: 'Solution' } as const;
</script>

<svelte:head>
	<title>{problem.title} · BeyondLeetcode</title>
</svelte:head>

{#key `${problem.id}:${problem.build.language}`}
	<ProblemWorkspace {problem} {view} onview={(next) => (pane = next.pane)} solution={view.section === 'solution' ? data.solution : undefined}>
		{#snippet statement()}
			<div class="left">
				<nav class="tabs mono" aria-label="Problem sections">
					<a href="/problems/{problem.id}" data-sveltekit-noscroll aria-current={view.section === 'problem' ? 'page' : undefined}>Problem</a>
					<a href="/problems/{problem.id}?tab=hints" data-sveltekit-noscroll aria-current={view.section === 'hints' ? 'page' : undefined}>Hints</a>
					<a href="/problems/{problem.id}?tab=solution" data-sveltekit-noscroll data-sveltekit-preload-data="off" aria-current={view.section === 'solution' ? 'page' : undefined}>Solution</a>
				</nav>
				<!-- The pane scrolls on its own; tabindex lets the keyboard reach it. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div class="scroll" role="region" aria-label={paneLabel[view.section]} tabindex="0">
				{#if view.section === 'hints' && data.hints}
					<HintsTab {problem} hints={data.hints} />
				{:else if view.section === 'solution' && data.solution}
					<SolutionTab {problem} solution={data.solution} />
				{:else}
					<section class="statement" aria-label="Problem">
						<ProblemHead {problem} title={problem.title} />
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
	.prose :global(.scrollbox) {
		overflow-x: auto;
		margin: 0 0 1em;
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
	@media (width > 900px), (max-width: 767.98px) {
		.left {
			display: flex;
			flex-direction: column;
			min-height: 0;
		}
		.tabs {
			flex-shrink: 0;
		}
		.scroll {
			position: relative; /* holds the absolutely placed .sr-only text inside the pane */
			flex: 1 1 0;
			min-height: 0;
			overflow-y: auto;
		}
	}
	@media (max-width: 900px) {
		.left {
			border-right: 0;
			border-bottom: 1px solid var(--ink);
		}
	}
	/* Phones: the Problem tab fills its pane; its own row scrolls sideways if it does not fit. */
	@media (max-width: 767.98px) {
		.left {
			border-right: 0;
		}
		.tabs {
			gap: 24px;
			padding: 0 var(--size-gutter);
			overflow-x: auto;
		}
		.tabs a {
			flex-shrink: 0;
			white-space: nowrap;
			box-sizing: border-box;
			min-height: var(--size-target);
			padding: 12px 0 10px;
			line-height: 20px;
		}
		.statement {
			padding: 24px var(--size-gutter);
		}
		.statement :global(h1) {
			font-size: 30px;
		}
		.prose {
			font-size: 18px;
		}
		.report {
			padding: 12px 0;
			min-height: var(--size-target);
			box-sizing: border-box;
		}
	}
</style>
