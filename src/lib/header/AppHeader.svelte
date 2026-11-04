<script lang="ts">
import type { Snippet } from 'svelte';
import type { Header } from '#lib/server/header.js';

/**
 * With `crumbs`, the bar is the Problem screen's: "BLC", the crumbs, and `actions` (Run and Submit,
 * hidden on a phone, which has them in a strip), with no nav links. Without, it is the app bar.
 */
let { header, crumbs, actions }: { header: Header; crumbs?: Snippet; actions?: Snippet } = $props();
</script>

{#if crumbs}
<header class="workspace-bar">
	<div class="lead">
		<a class="brand" href={header.wordmark.href}>{header.wordmark.phoneLabel}<span class="sr-only">, Beyond Leetcode Map</span></a>
		{@render crumbs()}
	</div>
	{#if actions}<div class="bar-actions">{@render actions()}</div>{/if}
</header>
{:else}
<header>
	<a class="brand" href={header.wordmark.href}><span class="wide">{header.wordmark.label}</span><span class="narrow">{header.wordmark.phoneLabel}<span class="sr-only">, Beyond Leetcode Map</span></span></a>
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
{/if}

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
	/* Text for screen readers only, after "BLC" in the wordmark link's name. It stays inline, so the name
	   reads "BLC, Beyond Leetcode Map" (a block or absolutely placed span would add a space before the comma). */
	.sr-only {
		font-size: 0;
		line-height: 0;
	}
	/* The Problem screen's bar: 64px, "BLC" and the crumbs left, Run and Submit right. The 1px top padding
	   offsets the bottom border so the 44px buttons clear the bar by 10px each side. */
	.workspace-bar {
		height: 64px;
		flex-shrink: 0;
		box-sizing: border-box;
		padding: 1px 32px 0;
	}
	.workspace-bar .lead {
		display: flex;
		gap: 28px;
		align-items: center;
	}
	.workspace-bar .brand {
		font-size: 18px;
		line-height: normal;
	}
	.bar-actions {
		display: flex;
		gap: 12px;
	}
	nav a[aria-current='page'] {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 8px;
	}

	@media (width > 767.98px) and (width <= 900px) {
		.workspace-bar {
			height: auto;
			min-height: 64px;
			flex-wrap: wrap;
			gap: 0 16px;
			padding: 1px 16px 0;
		}
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
		.workspace-bar {
			height: var(--size-bar);
			min-height: 0;
			flex-wrap: nowrap;
			padding: 0 var(--size-gutter);
		}
		.workspace-bar .lead {
			flex-grow: 1;
			justify-content: space-between;
			gap: 16px;
		}
		.workspace-bar .brand {
			line-height: 20px;
		}
		.bar-actions {
			display: none;
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
