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
		{:else if outcome?.kind === 'submitting'}
			<span class="mono muted" role="status">Submitting</span>
		{/if}
	</div>

	<div class="body">
		{#if !outcome}
			<p class="muted mono">Run your code to see how it does on the Example Tests.</p>
		{:else if outcome.kind === 'running' || outcome.kind === 'submitting'}
			<p class="muted mono">Waiting for the runner…</p>
		{:else if outcome.kind === 'verdict'}
			{@const { verdict, failure } = outcome.view}
			<div class="state mono" class:fail={verdict !== 'Accepted'} aria-label="Verdict">
				<span>{verdict}</span>
				{#if verdict === 'Accepted'}<span class="muted">all tests passed</span>{/if}
			</div>
			{#if outcome.view.accepted}
				{@const { accepted } = outcome.view}
				<div class="accepted" aria-label="Accepted panel">
					{#if accepted.topicCompleted}
						<div class="unlock-note">
							<span class="label">Topic complete</span>
							{#if accepted.newlyUnlocked.length > 0}
								<span class="unlocks">
									It unlocks
									{#each accepted.newlyUnlocked as topic, i (topic.id)}{i > 0 ? ', ' : ''}<a class="topic-link" href="/topics/{topic.id}">{topic.title}</a>{/each}
									on the map.
								</span>
							{/if}
						</div>
					{/if}
					{#if accepted.nextProblemId}
						<a class="next" href="/problems/{accepted.nextProblemId}">Next problem →</a>
					{/if}
				</div>
			{/if}
			{#if failure?.kind === 'compile'}
				<pre class="mono block" aria-label="Compile error">{failure.message}</pre>
			{:else if failure?.kind === 'example'}
				<pre class="mono block" aria-label="Failed Example Test {failure.name}"><span class="muted">case</span>
{failure.name}<span class="muted">input</span>
{failure.input}<span class="muted">expected</span>
{failure.expected}<span class="muted">got</span>
<span class="fail">{failure.actual}</span>{#if failure.stderr}<span class="muted">stderr</span>
<span class="fail">{failure.stderr}</span>{/if}</pre>
			{:else if failure?.kind === 'hidden'}
				<p class="mono block">Failed a hidden test</p>
			{:else if failure?.kind === 'earlierStep'}
				<p class="mono block">
					Your change broke an earlier step:
					<a href="/problems/{failure.problemId}">{failure.problemTitle} →</a>
				</p>
			{/if}
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
	a {
		color: var(--ink);
		text-underline-offset: 4px;
	}
	.accepted {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 16px;
		padding-bottom: 16px;
	}
	.unlock-note {
		display: flex;
		gap: 16px;
		align-items: baseline;
	}
	.label {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.unlocks {
		font-family: var(--font-serif);
		font-size: 20px;
		line-height: 1.4;
		color: var(--body);
	}
	.topic-link {
		color: var(--accent);
		text-underline-offset: 5px;
	}
	.next {
		font-family: var(--font-mono);
		height: 44px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		padding: 0 22px;
		background: var(--ink);
		color: var(--on-ink);
		border-radius: 2px;
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
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
