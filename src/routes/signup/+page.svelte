<script lang="ts">
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();

// A refusal on one field goes under that field; any other goes above the button.
const fieldError = (field: 'name' | 'email' | 'password') =>
	form?.field === field ? form.message : undefined;
const formError = $derived(form && !form.field ? form.message : undefined);
const describedBy = (field: 'name' | 'email' | 'password') =>
	fieldError(field) ? `${field}-error` : field === 'password' ? 'password-hint' : undefined;

// What an account keeps: the progress, the code and the hints it stores, nothing the product does not have.
const keeps = [
	{
		title: 'Your progress',
		text: 'The chapters you have read and the problems you have solved, on any device you sign in from.'
	},
	{
		title: 'Your code',
		text: 'Each build you grow, in the language you chose for its topic.'
	},
	{
		title: 'Your hints',
		text: 'The hints you have revealed stay revealed.'
	}
];
</script>

<svelte:head>
	<title>Sign up · BeyondLeetcode</title>
</svelte:head>

<main>
	<div class="left">
		{#if data.open}
			<form method="POST" class="block">
				<header class="intro">
					<h1>Start reading.</h1>
					<p class="lede">An account is a name, an email and a password.</p>
				</header>
				<div class="field">
					<label for="name">Name</label>
					<input
						id="name"
						type="text"
						name="name"
						autocomplete="name"
						required
						value={form?.name ?? ''}
						aria-invalid={fieldError('name') ? 'true' : undefined}
						aria-describedby={describedBy('name')}
					/>
					{#if fieldError('name')}<span id="name-error" class="hint" role="alert">{fieldError('name')}</span>{/if}
				</div>
				<div class="field">
					<label for="email">Email</label>
					<input
						id="email"
						type="email"
						name="email"
						autocomplete="email"
						required
						value={form?.email ?? ''}
						aria-invalid={fieldError('email') ? 'true' : undefined}
						aria-describedby={describedBy('email')}
					/>
					{#if fieldError('email')}<span id="email-error" class="hint" role="alert">{fieldError('email')}</span>{/if}
				</div>
				<div class="field">
					<label for="password">Password</label>
					<input
						id="password"
						type="password"
						name="password"
						autocomplete="new-password"
						required
						aria-invalid={fieldError('password') ? 'true' : undefined}
						aria-describedby={describedBy('password')}
					/>
					{#if fieldError('password')}
						<span id="password-error" class="hint" role="alert">{fieldError('password')}</span>
					{:else}
						<span id="password-hint" class="hint">At least {data.minPasswordLength} characters.</span>
					{/if}
				</div>
				{#if formError}
					<p class="error" role="alert">{formError}</p>
				{/if}
				<button type="submit">Create account →</button>
			</form>
			<p class="switch">Already reading? <a href="/signin">Sign in</a></p>
		{:else}
			<div class="block">
				<header class="intro">
					<h1>Sign-up is closed.</h1>
					<p class="lede">This instance is invite-only. Ask your admin for an invite.</p>
				</header>
				<a class="outline" href="/signin">Sign in</a>
			</div>
			<p class="switch">Have an invite link? Open it from your admin's message.</p>
		{/if}
	</div>

	<aside class="keeps">
		<span class="eyebrow">What an account keeps</span>
		<ol>
			{#each keeps as item, i (item.title)}
				<li>
					<span class="number" aria-hidden="true">{i + 1}</span>
					<div class="item">
						<span class="title">{item.title}</span>
						<span class="text">{item.text}</span>
					</div>
				</li>
			{/each}
		</ol>
	</aside>
</main>

<style>
	main {
		display: grid;
		grid-template-columns: 600px minmax(0, 1fr);
		min-height: 720px;
	}
	.left {
		box-sizing: border-box;
		padding: 40px 72px 48px clamp(16px, 6.7vw, 96px);
		display: flex;
		flex-direction: column;
	}
	/* The form sits between the top and the "already reading" line, as the board centres it. */
	.block {
		margin: auto 0;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-bottom: 8px;
	}
	h1 {
		margin: 0;
		font-weight: 400;
		font-size: 60px;
		line-height: 1.04;
		letter-spacing: -0.015em;
	}
	.lede {
		margin: 0;
		font-size: 20px;
		line-height: 1.5;
		color: var(--body);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: var(--muted);
	}
	label,
	.eyebrow {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	input {
		height: 52px;
		box-sizing: border-box;
		padding: 0 16px;
		background: var(--field);
		border: 1px solid var(--ink);
		border-radius: 2px;
		color: var(--ink);
		font-family: var(--font-serif);
		font-size: 19px;
	}
	.field:has(input[aria-invalid='true']) {
		color: var(--accent);
	}
	input[aria-invalid='true'] {
		border: 2px solid var(--accent);
	}
	.hint {
		font-family: var(--font-mono);
		font-size: 13px;
	}
	.error {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--accent);
	}
	button,
	.outline {
		box-sizing: border-box;
		align-self: flex-start;
		height: 52px;
		padding: 0 28px;
		display: inline-flex;
		align-items: center;
		border-radius: 2px;
		font-family: var(--font-mono);
		font-size: 15px;
		font-weight: 500;
		cursor: pointer;
	}
	button {
		background: var(--ink);
		color: var(--on-ink);
		border: 0;
	}
	.outline {
		background: transparent;
		color: var(--ink);
		border: 1px solid var(--ink);
		text-decoration: none;
	}
	.switch {
		margin: 0;
		font-size: 18px;
		line-height: 1.5;
		color: var(--body);
	}
	.switch a {
		color: var(--ink);
		font-style: italic;
		text-underline-offset: 5px;
	}
	.keeps {
		box-sizing: border-box;
		padding: 96px;
		background: var(--panel);
		border-left: 1px solid var(--ink);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 40px;
	}
	.eyebrow {
		color: var(--muted);
		letter-spacing: 0.08em;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		max-width: 620px;
		border-top: 1px solid var(--ink);
	}
	li {
		display: grid;
		grid-template-columns: 96px minmax(0, 1fr);
		column-gap: 16px;
		align-items: start;
		padding: 28px 0;
		border-bottom: 1px solid var(--rule);
	}
	li:last-child {
		border-bottom-color: var(--ink);
	}
	.number {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 72px;
		line-height: 0.85;
		color: var(--rule);
	}
	.item {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.title {
		font-size: 26px;
		line-height: 1.25;
	}
	.text {
		font-size: 18px;
		line-height: 1.5;
		color: var(--body);
	}
	/* Mobile follows the Sign in board: one column, no side panel, a stretched button and the link under a rule. */
	@media (max-width: 900px) {
		main {
			grid-template-columns: minmax(0, 1fr);
			min-height: 0;
		}
		.left {
			padding: 32px 20px 0;
		}
		.block {
			margin: 0;
			gap: 20px;
		}
		.intro {
			gap: 8px;
			padding-bottom: 4px;
		}
		h1 {
			font-size: 40px;
			line-height: 1.08;
			letter-spacing: -0.01em;
		}
		.lede {
			font-size: 18px;
			line-height: 1.6;
		}
		input,
		button,
		.outline {
			height: 48px;
		}
		input {
			font-size: 18px;
		}
		button {
			align-self: stretch;
			justify-content: center;
		}
		.switch {
			margin-top: 20px;
			padding: 12px 0 20px;
			border-top: 1px solid var(--rule);
			line-height: 1.6;
		}
		.switch a {
			display: inline-block;
			padding: 8px 0;
		}
		.keeps {
			display: none;
		}
	}
</style>
