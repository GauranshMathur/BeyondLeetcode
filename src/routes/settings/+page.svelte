<script lang="ts">
import type { SubmitFunction } from '@sveltejs/kit';
import { enhance } from '$app/forms';
import { parseTheme } from '$lib/theme';
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();

// Without JavaScript the select needs its button; with it, choosing submits.
let enhanced = $state(false);
$effect(() => {
	enhanced = true;
});

// The saved cookie only reaches the next render; apply the choice to this page now.
const applyTheme: SubmitFunction = ({ formData }) => {
	const chosen = parseTheme(formData.get('theme')?.toString());
	return async ({ update }) => {
		if (chosen) document.documentElement.dataset.theme = chosen;
		else delete document.documentElement.dataset.theme;
		await update({ reset: false });
	};
};
</script>

<svelte:head>
	<title>Settings · BeyondLeetcode</title>
</svelte:head>

<main>
	<section class="intro">
		<span class="eyebrow">Settings</span>
		<h1>Settings</h1>
	</section>

	<section class="group">
		<div class="label">
			<h2>Theme</h2>
			<p>How the whole app looks.</p>
		</div>
		<form class="control" method="POST" action="?/theme" use:enhance={applyTheme}>
			<label>
				Theme
				<select
					name="theme"
					onchange={(e) => enhanced && e.currentTarget.form?.requestSubmit()}
				>
					<option value="light" selected={data.theme === 'light'}>Light</option>
					<option value="dark" selected={data.theme === 'dark'}>Dark</option>
					<option value="system" selected={data.theme === null}>Follow my device</option>
				</select>
			</label>
			{#if !enhanced}
				<button type="submit">Save theme</button>
			{/if}
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		</form>
	</section>

	<!-- C20b adds Reset progress here. -->
</main>

<style>
	main {
		padding-bottom: 96px;
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 64px clamp(16px, 6.7vw, 96px) 0;
	}
	.eyebrow {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	h1 {
		margin: 0;
		font-weight: 400;
		font-size: clamp(40px, 5vw, 64px);
		line-height: 1.04;
		letter-spacing: -0.015em;
	}
	.group {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		column-gap: 32px;
		row-gap: 24px;
		margin: 56px clamp(16px, 6.7vw, 96px) 0;
		padding-top: 32px;
		border-top: 1px solid var(--ink);
	}
	.label {
		grid-column: span 4;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.control {
		grid-column: 6 / span 6;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	@media (max-width: 800px) {
		.label,
		.control {
			grid-column: 1 / -1;
		}
	}
	h2 {
		margin: 0;
		font-weight: 400;
		font-size: 30px;
		line-height: 1.2;
	}
	.label p {
		margin: 0;
		font-size: 17px;
		line-height: 1.5;
		color: var(--muted);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	select {
		height: 52px;
		box-sizing: border-box;
		max-width: 320px;
		padding: 0 16px;
		background: var(--field);
		border: 1px solid var(--ink);
		border-radius: 2px;
		color: var(--ink);
		font-family: var(--font-serif);
		font-size: 19px;
		letter-spacing: 0;
		text-transform: none;
	}
	button {
		align-self: flex-start;
		height: 52px;
		padding: 0 28px;
		background: var(--ink);
		color: var(--on-ink);
		border: 0;
		border-radius: 2px;
		font-family: var(--font-mono);
		font-size: 15px;
		font-weight: 500;
	}
	.error {
		margin: 0;
		color: var(--accent);
	}
</style>
