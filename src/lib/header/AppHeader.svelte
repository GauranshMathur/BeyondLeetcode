<script lang="ts">
import type { Header } from '#lib/server/header.js';

let { header }: { header: Header } = $props();
</script>

<header>
	<a class="brand" href={header.wordmark.href}><span class="wide">{header.wordmark.label}</span><span class="narrow">{header.wordmark.phoneLabel}</span></a>
	{#if !header.bare}
	<nav aria-label="Primary">
		<!-- Below 768px the wordmark is the link to the Map, so the Map link is hidden there (F.10f). -->
		{#each header.links as link (link.key)}
		<a class={link.key} href={link.href} aria-current={link.current ? 'page' : undefined}>{#if link.phoneLabel === link.label}<span>{link.label}</span>{:else}<span class="wide">{link.label}</span><span class="narrow">{link.phoneLabel}</span>{/if}</a>
		{/each}
		<!-- Sign out is a POST, never a link; Settings has it too, and on a phone only Settings does. -->
		{#if header.signOut}
		<form class="signout" method="POST" action="/settings?/signout">
			<button type="submit">Sign out</button>
		</form>
		{/if}
	</nav>
	{/if}
</header>

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px clamp(16px, 6.7vw, 96px);
		border-bottom: 1px solid var(--ink);
	}
	.brand {
		color: var(--ink);
		font-family: var(--font-sans);
		font-weight: 600;
		font-size: 22px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-decoration: none;
		display: inline-block;
		padding: 10px 0;
		line-height: 24px;
	}
	nav {
		display: flex;
		gap: 40px;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 14px;
	}
	nav a {
		color: var(--ink);
		padding: 12px 0;
		line-height: 20px;
		text-decoration: none;
	}
	/* A real button set exactly like a nav link (F.11): mono 14, ink, no fill, no border, 44px tall. */
	.signout {
		display: contents;
	}
	.signout button {
		padding: 12px 0;
		line-height: 20px;
		background: transparent;
		border: 0;
		border-radius: 2px;
		color: var(--ink);
		font-family: inherit;
		font-size: inherit;
		cursor: pointer;
	}
	.narrow {
		display: none;
	}
	nav a[aria-current='page'] {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 8px;
	}

	/* Below 768px (F.10f): a bar, BLC left, at most two target-sized links right, Sign out only on Settings.
	   A long name truncates with an ellipsis instead of widening the bar. */
	@media (max-width: 767.98px) {
		header {
			height: var(--size-bar);
			box-sizing: border-box;
			padding: 0 var(--size-gutter);
			gap: 24px;
		}
		.wide {
			display: none;
		}
		.narrow {
			display: inline;
		}
		.brand {
			flex-shrink: 0;
			font-size: 18px;
			padding: 12px 0;
			line-height: 20px;
		}
		nav {
			min-width: 0;
			gap: 24px;
		}
		.signout,
		.map {
			display: none;
		}
		nav a {
			white-space: nowrap;
		}
		.users {
			flex-shrink: 0;
		}
		.account {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
</style>
