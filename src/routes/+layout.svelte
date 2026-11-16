<script lang="ts">
import { onMount } from 'svelte';
import favicon from '#lib/assets/favicon.svg';
import AppHeader from '#lib/header/AppHeader.svelte';
import { page } from '$app/state';
import '#lib/styles/tokens.css';

let { children, data } = $props();

// The e2e tests wait for this before they type or click (src/lib/test/hydrated.ts). No visible behaviour.
onMount(() => {
	document.documentElement.dataset.hydrated = 'true';
});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#snippet screen()}
{#if !data.header.inPage || page.error}
<AppHeader header={data.header} />
{/if}

{@render children()}
{/snippet}

{#if data.devMode}
<!-- Wraps the banner and the screen only when the banner is drawn: the screens that fill the viewport (the Problem screen, the Chapter page) subtract the band's height through this property, and read 0px without it. -->
<div class="dev-scope">
	<!-- A standing state, not news: a region, not a live region. The visible label is hidden from a screen reader so the name is not read twice. -->
	<section class="dev-banner" aria-label="Dev mode">
		<span class="marker" aria-hidden="true"></span>
		<span class="label" aria-hidden="true">Dev mode</span>
		<span>Everything is unlocked.</span>
	</section>
	{@render screen()}
</div>
{:else}
{@render screen()}
{/if}

<style>
	.dev-scope {
		display: contents;
		--dev-banner-height: 40px;
	}

	.dev-banner {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 10px;
		height: 40px;
		min-width: 0;
		/* The header's own gutter, so the two edges line up. */
		padding: 0 clamp(16px, 6.7vw, 96px);
		overflow: hidden;
		white-space: nowrap;
		background: var(--ink);
		color: var(--on-ink);
		font-family: var(--font-mono);
		font-size: 12px;
		line-height: 20px;
	}

	.marker {
		box-sizing: border-box;
		flex-shrink: 0;
		width: 10px;
		height: 10px;
		border: 2px solid var(--on-ink);
	}

	.label {
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
</style>
