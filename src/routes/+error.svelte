<script lang="ts">
import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.error?.message} · BeyondLeetcode</title>
</svelte:head>

<main>
	<!-- The big numeral and the figure are decoration: the h1 and the kicker carry the meaning. -->
	<div class="numeral" aria-hidden="true">{page.status}</div>
	<div class="body">
		<span class="kicker">Error {page.status}</span>
		<h1>{page.error?.message}</h1>
		{#if page.status === 404}
		<svg class="figure" viewBox="0 0 560 120" width="560" height="120" role="img" aria-label="A requested path is hashed to a bucket that is empty, so the lookup misses.">
			<rect x="0" y="30" width="190" height="60" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.25" />
			<text x="14" y="56" font-size="14" font-weight="500" fill="var(--ink)">key</text>
			<text x="14" y="76" font-size="12" fill="var(--muted)">/the/page/you/asked</text>
			<line x1="190" y1="60" x2="296" y2="60" stroke="var(--ink)" stroke-width="1.25" />
			<polyline points="290,55 297,60 290,65" fill="none" stroke="var(--ink)" stroke-width="1.25" />
			<text x="210" y="48" font-size="11" fill="var(--muted)">hash()</text>
			<rect x="300" y="30" width="190" height="60" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 5" />
			<text x="316" y="56" font-size="14" font-weight="500" fill="var(--accent)">empty bucket</text>
			<text x="316" y="76" font-size="12" fill="var(--muted)">lookup mis</text>
		</svg>
		{/if}
		<div><a class="back" href="/">Back to the Map →</a></div>
	</div>
</main>

<style>
	main {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		column-gap: 32px;
		padding: 112px clamp(16px, 6.7vw, 96px) 64px;
		align-items: start;
	}
	.numeral {
		grid-column: span 4;
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 220px;
		line-height: 0.8;
		color: var(--rule);
	}
	.body {
		grid-column: 5 / span 7;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.kicker {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	h1 {
		margin: 0;
		font-weight: 400;
		font-size: 60px;
		line-height: 1.04;
		letter-spacing: -0.015em;
	}
	.figure {
		display: block;
		max-width: 100%;
		height: auto;
		font-family: var(--font-mono);
	}
	.back {
		display: inline-flex;
		align-items: center;
		min-height: 52px;
		padding: 0 28px;
		background: var(--ink);
		color: var(--on-ink);
		text-decoration: none;
		border-radius: 2px;
		font-family: var(--font-mono);
		font-size: 15px;
		font-weight: 500;
	}
	@media (max-width: 767.98px) {
		main {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			padding: 32px var(--size-gutter) 32px;
		}
		.numeral,
		.figure {
			display: none;
		}
		.body {
			gap: 20px;
		}
		.kicker {
			font-size: 12px;
		}
		h1 {
			font-size: var(--size-h1-phone);
			line-height: var(--leading-h1-phone);
			letter-spacing: -0.01em;
		}
		.back {
			display: flex;
			justify-content: center;
			height: 48px;
			min-height: 0;
			padding: 0 20px;
			font-size: 14px;
		}
	}
</style>
