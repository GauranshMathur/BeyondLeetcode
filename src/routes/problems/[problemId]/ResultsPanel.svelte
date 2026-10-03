<script lang="ts">
import type { RunTestStatus } from '$lib/server/learning/core';
import type { Outcome } from './outcome';

let { outcome }: { outcome: Outcome | undefined } = $props();

const statusLabel: Record<RunTestStatus, string> = {
	passed: 'pass',
	wrongAnswer: 'fail · wrong answer',
	runtimeError: 'fail · runtime error',
	timeout: 'fail · time limit exceeded'
};

const passedCount = $derived(
	outcome?.kind === 'result' ? outcome.view.tests.filter((t) => t.passed).length : 0
);
const total = $derived(outcome?.kind === 'result' ? outcome.view.tests.length : 0);
</script>

<section class="console" aria-label="Console">
	<div class="head">
		<span class="tab mono">Tests</span>
		{#if outcome?.kind === 'result' && !outcome.view.compileError}
			<span class="mono" class:fail={passedCount < total} role="status">{passedCount} of {total} passed</span>
		{:else if outcome?.kind === 'result'}
			<span class="mono fail" role="status">no tests ran</span>
		{:else if outcome?.kind === 'running'}
			<span class="mono muted" role="status">Running</span>
		{/if}
	</div>

	<div class="body">
		{#if !outcome}
			<p class="muted mono">Run your code to see how it does on the Example Tests.</p>
		{:else if outcome.kind === 'running'}
			<p class="muted mono">Waiting for the runner…</p>
		{:else if outcome.kind === 'unavailable'}
			<p class="mono fail" role="alert">The runner is unavailable. Try again.</p>
		{:else if outcome.view.compileError}
			<div class="state fail mono">Compile error</div>
			<pre class="mono block" aria-label="Compile error">{outcome.view.compileError}</pre>
		{:else}
			<ul aria-label="Example Test results">
				{#each outcome.view.tests as test (test.name)}
					<li class="test" aria-label="Example Test {test.name}" data-status={test.status}>
						<div class="state mono" class:fail={!test.passed}>
							<span>case {test.name}</span><span>{statusLabel[test.status]}</span>
						</div>
						<pre class="mono block"><span class="muted">input</span>
{test.input}<span class="muted">expected</span>
{test.expected}<span class="muted">got</span>
<span class:fail={!test.passed}>{test.actual}</span>{#if test.stderr}<span class="muted">stderr</span>
<span class="fail">{test.stderr}</span>{/if}</pre>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

<style>
	.console {
		flex-shrink: 0;
		max-height: 300px;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--ink);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 24px;
		border-bottom: 1px solid var(--rule);
		font-size: 13px;
	}
	.tab {
		padding: 14px 0 12px;
		border-bottom: 2px solid var(--accent);
		color: var(--ink);
	}
	.body {
		overflow: auto;
		padding: 0 24px 24px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.mono {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 13px;
	}
	.muted {
		color: var(--muted);
	}
	.fail {
		color: var(--accent);
	}
	.state {
		display: flex;
		justify-content: space-between;
		padding: 16px 0;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.block {
		margin: 0;
		padding: 16px 20px;
		background: var(--panel);
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
		line-height: 1.7;
		color: var(--body);
		white-space: pre-wrap;
		overflow-x: auto;
	}
</style>
