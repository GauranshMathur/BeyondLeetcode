<script lang="ts">
import { page } from '$app/state';
import favicon from '$lib/assets/favicon.svg';
import '$lib/styles/tokens.css';

let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
	/>
</svelte:head>

<header>
	<a class="brand" href="/">Beyond Leetcode</a>
	<nav aria-label="Primary">
		<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Map</a>
		<!-- Local Mode has no username: the canvas nav shows "Local" (S1). -->
		<span class="who">Local</span>
	</nav>
</header>

{@render children()}

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
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 600;
		font-size: 22px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-decoration: none;
	}
	nav {
		display: flex;
		gap: 40px;
		align-items: center;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 14px;
	}
	nav a {
		color: var(--ink);
		padding: 12px 0;
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 8px;
	}
	.who {
		padding: 12px 0;
	}
</style>
