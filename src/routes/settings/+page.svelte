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
	return async ({ result, update }) => {
		if (result.type === 'success') {
			if (chosen) document.documentElement.dataset.theme = chosen;
			else delete document.documentElement.dataset.theme;
		}
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

	<section class="group" class:last={!data.multiUser}>
		<div class="label">
			<h2>Reset progress</h2>
			<p>Start over from the beginning.</p>
		</div>
		<div class="control">
			<p class="lead">
				Deletes the Chapters you have read, your saved code, your Submissions and the Hints you have revealed.
			</p>
			<form method="GET" action="/settings">
				<button type="submit" name="reset" value="confirm" class="outline" aria-expanded={data.confirmingReset}>Reset progress</button>
			</form>
			{#if data.confirmingReset}
				<div class="confirm" role="group" aria-label="Reset progress">
					<div class="confirm-text">
						<span class="ask">Reset all progress?</span>
						<span id="reset-note" class="note">This cannot be undone. Your theme is kept.</span>
					</div>
					<div class="confirm-actions">
						<a class="cancel" href="/settings">Cancel</a>
						<form method="POST" action="?/reset">
							<button type="submit" class="small" aria-describedby="reset-note">Reset progress</button>
						</form>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Passwords belong to Accounts, so the row is for a Multi-user Instance only. -->
	{#if data.multiUser}
		<section class="group">
			<div class="label">
				<h2>Password</h2>
				<p>Change the password you sign in with.</p>
			</div>
			<div class="control">
				<a class="button outline" href="/account/password">Change password</a>
			</div>
		</section>
	{/if}

	<!-- Sign out is for a Multi-user Instance only: Local Mode has no accounts and no sign-in. -->
	{#if data.multiUser}
		<section class="group last">
			<div class="label">
				<h2>Session</h2>
			</div>
			<form class="control" method="POST" action="?/signout">
				<button type="submit" class="outline">Sign out</button>
				{#if form?.signOut}<p class="error" role="alert">{form.signOut}</p>{/if}
			</form>
		</section>
	{/if}
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
	button,
	.button {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
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
	.last {
		padding-bottom: 32px;
		border-bottom: 1px solid var(--ink);
	}
	.lead {
		margin: 0;
		font-size: 19px;
		line-height: 1.5;
		color: var(--body);
	}
	.outline {
		background: transparent;
		color: var(--ink);
		border: 1px solid var(--ink);
	}
	.confirm {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 24px;
		padding: 16px 24px;
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
	}
	.confirm-text {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ask {
		font-family: var(--font-mono);
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink);
	}
	.note {
		font-size: 16px;
		line-height: 1.5;
		color: var(--body);
	}
	.confirm-actions {
		display: flex;
		gap: 20px;
		align-items: center;
		flex-shrink: 0;
	}
	.cancel {
		padding: 12px 0;
		line-height: 20px;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 14px;
		text-decoration: none;
	}
	.small {
		height: 44px;
		padding: 0 22px;
		background: transparent;
		color: var(--ink);
		border: 1px solid var(--ink);
		border-radius: 2px;
		font-family: var(--font-mono);
		font-size: 14px;
		font-weight: 500;
	}
	@media (max-width: 800px) {
		.confirm {
			flex-direction: column;
			align-items: flex-start;
		}
	}
	.error {
		margin: 0;
		color: var(--accent);
	}
</style>
