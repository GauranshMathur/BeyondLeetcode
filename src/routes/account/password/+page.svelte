<script lang="ts">
import { enhance } from '$app/forms';
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();

// The message sits under the field it is about; a failure that is about none goes above the buttons.
const under = (field: 'current' | 'new' | 'confirm') =>
	form && 'field' in form && form.field === field ? form.message : undefined;
const fields = [
	{ id: 'current', label: 'Current password', complete: 'current-password' },
	{ id: 'new', label: 'New password', complete: 'new-password' },
	{ id: 'confirm', label: 'Confirm new password', complete: 'new-password' }
] as const;
const general = $derived(form && 'field' in form && form.field === null ? form.message : undefined);
</script>

<svelte:head>
	<title>{data.forced ? 'Choose a new password' : 'Change password'} · BeyondLeetcode</title>
</svelte:head>

<main>
	<section class="intro">
		{#if data.forced}
			<span class="eyebrow">Password change required</span>
			<h1>Choose a new password.</h1>
			<p class="lede">
				The password your admin gave you was for one use. Replace it with your own before you continue.
			</p>
		{:else}
			<span class="eyebrow">Settings · Password</span>
			<h1>Change password.</h1>
			<p class="lede">Pick a new password. Your other sessions are signed out.</p>
		{/if}
	</section>

	<section class="group">
		<div class="label">
			<h2>Password</h2>
			<p>At least {data.minPasswordLength} characters.</p>
		</div>
		{#if data.signedOut}
			<div class="control">
				{#if general}<p class="hint" role="alert">{general}</p>{/if}
				<a class="cancel" href="/signin">Sign in</a>
			</div>
		{:else}
		<form class="control" method="POST" use:enhance>
			{#each fields as field (field.id)}
				{@const message = under(field.id)}
				<div class="field" class:invalid={message}>
					<label for={field.id}>{field.label}</label>
					<input
						id={field.id}
						type="password"
						name={field.id}
						autocomplete={field.complete}
						required
						aria-invalid={message ? 'true' : undefined}
						aria-describedby={message ? `${field.id}-error` : undefined}
					/>
					{#if message}<span id="{field.id}-error" class="hint" role="alert">{message}</span>{/if}
				</div>
			{/each}
			{#if general}<p class="hint" role="alert">{general}</p>{/if}
			{#if data.changed}<p class="done" role="status">Password changed.</p>{/if}
			{#if data.unfinished}
				<p class="hint" role="alert">
					Your password was changed, but finishing failed. Enter the password you just chose as your current password, choose another new password and submit again.
				</p>
			{/if}
			<div class="actions">
				<button type="submit">{data.forced ? 'Set password and continue →' : 'Change password'}</button>
				{#if !data.forced}<a class="cancel" href="/settings">Cancel</a>{/if}
			</div>
		</form>
		{/if}
	</section>
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
	.lede {
		margin: 0;
		max-width: 640px;
		font-size: 20px;
		line-height: 1.5;
		color: var(--body);
	}
	.group {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		column-gap: 32px;
		row-gap: 24px;
		margin: 56px clamp(16px, 6.7vw, 96px) 0;
		padding-top: 32px;
		padding-bottom: 32px;
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
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
		gap: 22px;
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
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: var(--muted);
	}
	label {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.field.invalid {
		color: var(--accent);
	}
	input {
		height: 52px;
		box-sizing: border-box;
		max-width: 420px;
		padding: 0 16px;
		background: var(--field);
		border: 1px solid var(--ink);
		border-radius: 2px;
		color: var(--ink);
		font-family: var(--font-serif);
		font-size: 19px;
		letter-spacing: 0;
	}
	input[aria-invalid='true'] {
		border: 2px solid var(--accent);
	}
	.hint {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0;
		text-transform: none;
		color: var(--accent);
	}
	.done {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--body);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 28px;
	}
	button {
		height: 52px;
		padding: 0 28px;
		background: var(--ink);
		color: var(--on-ink);
		border: 0;
		border-radius: 2px;
		font-family: var(--font-mono);
		font-size: 15px;
		font-weight: 500;
		cursor: pointer;
	}
	.cancel {
		padding: 12px 0;
		line-height: 20px;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 14px;
		text-decoration: none;
	}
</style>
