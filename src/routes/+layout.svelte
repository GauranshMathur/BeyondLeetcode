<script lang="ts">
import { page } from '$app/state';
import favicon from '$lib/assets/favicon.svg';
import '$lib/styles/tokens.css';

let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !(page.route.id === '/problems/[problemId]' && !page.error)}
<header>
	<a class="brand" href="/">Beyond Leetcode</a>
	<!-- Setup shows the wordmark alone: before the Instance is set up there is no Map and no name. -->
	{#if page.route.id !== '/setup'}
	<nav aria-label="Primary">
		<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Map</a>
		<!-- Users is the admin's, in Multi-user Mode only (the layout load decides). -->
		{#if data.showUsers}
		<a href="/users" aria-current={page.url.pathname === '/users' ? 'page' : undefined}>Users</a>
		{/if}
		<!-- The display name opens Settings; Local Mode's Identity names it "Local". -->
		<a href="/settings" aria-current={page.url.pathname === '/settings' ? 'page' : undefined}>{data.displayName}</a>
	</nav>
	{/if}
</header>
{/if}

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
	nav a[aria-current='page'] {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 8px;
	}
</style>
