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

{#if !(page.route.id === '/problems/[problemId]' && !page.error)}
<AppHeader header={data.header} />
{/if}

{@render children()}
