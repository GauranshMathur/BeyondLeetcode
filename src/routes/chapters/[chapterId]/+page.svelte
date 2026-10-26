<script lang="ts">
import { reportIssueUrl } from '#lib/issue-link.js';
import { enhance, type SubmitFunction } from '$app/forms';
import { navigating } from '$app/state';
import type { PageProps } from './$types';

let { data }: PageProps = $props();
const chapter = $derived(data.chapter);

// A failed save must not replace the Chapter with an error page; reopening the Chapter retries.
// update() re-runs the load, which would cancel a link the Learner clicked meanwhile; that link
// loads the next page fresh anyway, so skip the re-run then.
const saveRead: SubmitFunction =
	() =>
	async ({ result, update }) => {
		if (result.type === 'success' && !navigating.to) await update();
	};

let article = $state<HTMLElement>();
let endForm = $state<HTMLFormElement>();
let sentinel = $state<HTMLElement>();

// Once per page view: the first time the end of the Chapter scrolls into view, post the
// reach-end action. The server marks it Read (idempotent) and the load re-runs, so the
// marker updates without a reload. Opening an already Read Chapter posts nothing.
$effect(() => {
	if (!sentinel || !endForm || chapter.read) return;
	const form = endForm;
	const observer = new IntersectionObserver((entries) => {
		if (entries.some((e) => e.isIntersecting)) {
			observer.disconnect();
			form.requestSubmit();
		}
	});
	observer.observe(sentinel);
	return () => observer.disconnect();
});

// Code, tables and figures scroll sideways inside their own box on a phone, so the box takes the
// keyboard focus and has a name. The Chapter's Markdown carries neither; idempotent, so a re-run is harmless.
$effect(() => {
	void chapter.bodyHtml;
	if (!article) return;
	const label = (el: Element, name: string) => {
		el.setAttribute('tabindex', '0');
		el.setAttribute('role', 'group');
		el.setAttribute('aria-label', name);
	};
	for (const pre of article.querySelectorAll('pre')) label(pre, 'Code block');
	for (const figure of article.querySelectorAll('figure')) label(figure, 'Figure');
	for (const table of article.querySelectorAll('table')) {
		if (table.parentElement?.classList.contains('scrollbox')) continue;
		const box = document.createElement('div');
		box.className = 'scrollbox';
		label(box, 'Table');
		table.before(box);
		box.append(table);
	}
});
</script>

<svelte:head>
	<title>{chapter.title} · BeyondLeetcode</title>
</svelte:head>

<div class="page">
	<aside>
		<nav class="crumbs" aria-label="Breadcrumb">
			<a href="/">map</a><span aria-hidden="true">›</span><a href="/topics/{chapter.topicId}">{chapter.topicTitle}</a>
		</nav>
		<div class="which">
			<span class="mono muted">Chapter</span>
			<span class="stitle">{chapter.title}</span>
			<span class="read mono">
				<span class="marker" class:filled={chapter.read} aria-hidden="true"></span>{chapter.read ? 'read' : 'not read'}
			</span>
		</div>
		<div class="links mono">
			<a href="/topics/{chapter.topicId}">← {chapter.topicTitle}</a>
			{#if chapter.nextChapterId}
				<a href="/chapters/{chapter.nextChapterId}">Next chapter →</a>
			{/if}
		</div>
	</aside>

	<main>
		<header>
			<span class="mono muted">Chapter · {chapter.topicTitle}</span>
			<h1>{chapter.title}</h1>
		</header>

		<article class="prose" bind:this={article}>{@html chapter.bodyHtml}</article>

		<div bind:this={sentinel} aria-hidden="true"></div>
		<form method="POST" action="?/reachEnd" use:enhance={saveRead} bind:this={endForm} hidden></form>

		{#if chapter.problems.length > 0}
			<section aria-labelledby="problems">
				<h2 id="problems">Problems</h2>
				<table class="problems">
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
								<td><span class={problem.kind === 'Core' ? 'core' : 'muted upper'}>{problem.kind.toLowerCase()}</span></td>
								<td class="status muted">{problem.status === 'Untouched' ? '—' : problem.status.toLowerCase()}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}

		<nav class="endlinks mono" aria-label="More in this Topic">
			<a href="/topics/{chapter.topicId}">↑ {chapter.topicTitle}</a>
			{#if chapter.nextChapterId}
				<a href="/chapters/{chapter.nextChapterId}">Next chapter →</a>
			{/if}
		</nav>

		<div class="reportrow">
			<a class="report mono" href={reportIssueUrl('Chapter', chapter.title, chapter.id)} target="_blank" rel="noopener noreferrer">Report an issue<span aria-hidden="true">↗</span><span class="sr-only">(opens GitHub in a new tab)</span></a>
		</div>
	</main>
</div>

<style>
	.page {
		display: flex;
		min-height: calc(100vh - 93px);
	}
	.mono,
	.crumbs,
	table {
		font-family: var(--font-mono);
	}
	.muted {
		color: var(--muted);
	}
	aside {
		width: 320px;
		flex-shrink: 0;
		box-sizing: border-box;
		padding: 32px 32px 48px;
		background: var(--panel);
		border-right: 1px solid var(--ink);
		display: flex;
		flex-direction: column;
		gap: 40px;
	}
	.crumbs {
		align-items: baseline;
		display: flex;
		gap: 10px;
		font-size: 13px;
		color: var(--muted);
	}
	.crumbs a:last-child {
		color: var(--ink);
	}
	.crumbs a {
		color: var(--muted);
		padding: 12px 0;
		line-height: 20px;
	}
	.which {
		display: flex;
		flex-direction: column;
		gap: 12px;
		font-size: 13px;
	}
	.which > .mono {
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.stitle {
		font-size: 24px;
		line-height: 1.25;
	}
	.read {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 13px;
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
	.links {
		display: flex;
		flex-direction: column;
		gap: 0;
		font-size: 13px;
	}
	.links a {
		color: var(--ink);
		text-decoration: none;
		padding: 12px 0;
		line-height: 20px;
	}
	.links a:hover {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-underline-offset: 6px;
	}
	main {
		flex-grow: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 80px clamp(16px, 6vw, 80px) 96px;
		display: flex;
		flex-direction: column;
		gap: 56px;
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 800px;
	}
	header .mono {
		font-size: 14px;
	}
	h1 {
		margin: 0;
		font-weight: 400;
		font-size: clamp(36px, 5vw, 64px);
		line-height: 1.04;
		letter-spacing: -0.015em;
	}
	.prose {
		max-width: 640px;
		font-size: 20px;
		line-height: 1.6;
		color: var(--body);
	}
	.prose :global(h1),
	.prose :global(h2) {
		font-weight: 400;
		font-size: 36px;
		line-height: 1.15;
		color: var(--ink);
		margin: 1.6em 0 20px;
	}
	.prose :global(h3) {
		font-weight: 400;
		font-size: 24px;
		color: var(--ink);
		margin: 1.4em 0 0.5em;
	}
	.prose :global(:first-child) {
		margin-top: 0;
	}
	.prose :global(p),
	.prose :global(ul),
	.prose :global(ol) {
		margin: 0 0 20px;
	}
	.prose :global(a) {
		color: var(--ink);
		text-decoration-color: var(--accent);
		text-underline-offset: 4px;
	}
	.prose :global(pre) {
		margin: 0 0 1.4em;
		padding: 24px 28px;
		background: var(--panel);
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
		font-family: var(--font-mono);
		font-size: 14px;
		line-height: 1.7;
		color: var(--ink);
		overflow-x: auto;
	}
	.prose :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
	.prose :global(pre code) {
		font-size: inherit;
	}
	.prose :global(blockquote) {
		margin: 0 0 1.2em;
		padding-left: 20px;
		border-left: 2px solid var(--accent);
		color: var(--muted);
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 32px;
		max-width: 960px;
	}
	h2 {
		margin: 0;
		font-weight: 400;
		font-size: 36px;
		line-height: 1.15;
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
	.ptitle:hover {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-underline-offset: 6px;
	}
	.core {
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-bottom: 2px solid var(--ink);
		padding-bottom: 2px;
	}
	.upper {
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.endlinks {
		display: none;
	}
	.prose :global(.scrollbox) {
		overflow-x: auto;
		margin: 0 0 20px;
	}
	.reportrow {
		max-width: 800px;
		border-top: 1px solid var(--rule);
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
	/* Phone (card C47): one column in source order; the Topic and next links move to the end. */
	@media (max-width: 767.98px) {
		.page {
			flex-direction: column;
			min-height: 0;
		}
		aside {
			width: auto;
			padding: 0 20px;
			background: transparent;
			border-right: 0;
			border-bottom: 1px solid var(--rule);
		}
		.crumbs {
			font-size: 12px;
		}
		.crumbs a {
			padding: 12px 0;
			line-height: 20px;
			min-height: 20px;
		}
		.which,
		.links {
			display: none;
		}
		main {
			padding: 32px 20px 48px;
			gap: 40px;
		}
		header {
			gap: 16px;
		}
		header .mono {
			font-size: 12px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}
		h1 {
			font-size: 40px;
			line-height: 1.08;
			letter-spacing: -0.01em;
		}
		.prose {
			font-size: 18px;
		}
		.prose :global(h1),
		.prose :global(h2),
		h2 {
			font-size: 30px;
		}
		.prose :global(h3) {
			font-size: 20px;
		}
		.prose :global(pre) {
			padding: 20px;
			font-size: 13px;
		}
		.prose :global(.scrollbox table) {
			min-width: 480px;
			font-family: var(--font-mono);
			font-size: 13px;
		}
		.prose :global(figure) {
			margin: 0 0 20px;
			overflow-x: auto;
		}
		section {
			gap: 20px;
		}
		table.problems,
		table.problems tbody {
			display: block;
		}
		table.problems {
			border-top: 1px solid var(--ink);
			counter-reset: row;
		}
		table.problems thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
		}
		table.problems tr {
			position: relative;
			display: grid;
			grid-template-columns: 40px auto minmax(0, 1fr);
			column-gap: 0;
			align-items: baseline;
			padding: 16px 0;
			border-bottom: 1px solid var(--rule);
		}
		table.problems tbody tr {
			counter-increment: row;
		}
		table.problems tr:last-child {
			border-bottom-color: var(--ink);
		}
		table.problems td,
		table.problems td.title {
			padding: 0;
			border: 0;
			font-size: 13px;
			color: var(--muted);
		}
		table.problems td.title {
			grid-column: 1 / -1;
			display: grid;
			grid-template-columns: 40px minmax(0, 1fr);
			column-gap: 0;
			align-items: baseline;
			padding-bottom: 6px;
		}
		table.problems td.title::before {
			content: counter(row, decimal-leading-zero);
			font-size: 14px;
			color: var(--muted);
		}
		table.problems td:nth-child(2) {
			grid-column: 2;
		}
		table.problems td.status {
			grid-column: 3;
			text-align: left;
		}
		table.problems td.status::before {
			content: '·';
			padding: 0 8px;
		}
		.ptitle {
			padding: 0;
			line-height: 1.25;
		}
		/* The whole row is the link. */
		.ptitle::after {
			content: '';
			position: absolute;
			inset: 0;
		}
		.core {
			color: var(--ink);
		}
		.endlinks {
			display: flex;
			flex-direction: column;
			padding-top: 8px;
			border-top: 1px solid var(--ink);
			font-size: 13px;
		}
		.report {
			box-sizing: border-box;
			min-height: 44px;
		}
		.endlinks a {
			display: flex;
			align-items: center;
			min-height: 44px;
			color: var(--ink);
			text-decoration: none;
		}
	}
</style>
