<script lang="ts">
import { page } from '$app/state';
import favicon from '$lib/assets/favicon.svg';
import '$lib/styles/tokens.css';

let { children, data } = $props();

// These pages show the wordmark alone: before the Instance is set up, or before anyone is signed in,
// there is no Map and no name to link to.
const BARE = new Set(['/setup', '/signin', '/signup']);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !(page.route.id === '/problems/[problemId]' && !page.error)}
<header>
	<a class="brand" href="/">Beyond Leetcode</a>
	{#if !BARE.has(page.route.id ?? '')}
	<nav aria-label="Primary">
		<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Map</a>
		<!-- Users is the admin's, in Multi-user Mode only (the layout load decides). -->
		{#if data.showUsers}
		<a href="/users" aria-current={page.url.pathname === '/users' ? 'page' : undefined}>Users</a>
		{/if}
		<!-- The display name opens Settings; Local Mode's Identity names it "Local". -->
		<a href="/settings" aria-current={page.url.pathname === '/settings' ? 'page' : undefined}>{data.displayName}</a>
		<!-- Sign out is a POST, never a link; Settings has it too, and on a phone only Settings does. -->
		{#if data.showSignOut}
		<form class="signout" method="POST" action="/settings?/signout">
			<button type="submit">Sign out</button>
		</form>
		{/if}
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
	/* Below 768px the header keeps at most Users and the name; Sign out is on Settings (F.10). */
	@media (max-width: 767px) {
		.signout {
			display: none;
		}
	}
	nav a[aria-current='page'] {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 8px;
	}
</style>
