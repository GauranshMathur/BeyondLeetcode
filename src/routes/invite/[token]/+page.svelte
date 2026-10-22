<script lang="ts">
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();

// Refused after the page loaded (used, expired or cancelled meanwhile) shows the same state as a dead link.
const valid = $derived(data.valid && !form?.invalid);

// A refusal on one field goes under that field; any other goes above the button.
const fieldError = (field: 'name' | 'email' | 'password') =>
	form?.field === field ? form.message : undefined;
const formError = $derived(form && !form.field && !form.invalid ? form.message : undefined);
const describedBy = (field: 'name' | 'email' | 'password') =>
	fieldError(field) ? `${field}-error` : field === 'password' ? 'password-hint' : undefined;
</script>

<svelte:head>
	<title>Accept invite · BeyondLeetcode</title>
	<meta name="referrer" content="no-referrer" />
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<div class="left">
		{#if valid}
			<form method="POST" class="block">
				<header class="intro">
					<h1>You are invited.</h1>
					<p class="lede">Set your name, email and a password to join this instance.</p>
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
						<span id="password-hint" class="hint">At least 12 characters.</span>
					{/if}
				</div>
				{#if formError}
					<p class="error" role="alert">{formError}</p>
				{/if}
				<button type="submit">Create account →</button>
			</form>
			<p class="switch">Already have an account? <a href="/signin">Sign in</a></p>
		{:else}
			<div class="block">
				<header class="intro">
					<h1>This invite link does not work.</h1>
					<p class="lede">It has expired or was already used. Ask your admin for a new invite.</p>
				</header>
				<a class="outline" href="/signin">Sign in</a>
			</div>
			<p class="switch">Already set up your account? Sign in with it.</p>
		{/if}
	</div>

	<aside class="figure">
		{#if valid}
			<svg viewBox="0 0 640 260" width="640" height="260" role="img" aria-label="An invite token opens one account.">
				<rect x="0" y="100" width="190" height="60" fill="var(--paper)" stroke="var(--accent)" stroke-width="2" />
				<text x="14" y="126" font-size="14" font-weight="500" fill="var(--ink)">invite token</text>
				<text x="14" y="146" font-size="12" fill="var(--muted)">one use · expires</text>
				<line x1="190" y1="130" x2="266" y2="130" stroke="var(--accent)" stroke-width="1.5" />
				<polyline points="260,125 267,130 260,135" fill="none" stroke="var(--accent)" stroke-width="1.5" />
				<rect x="270" y="100" width="190" height="60" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.25" />
				<text x="284" y="126" font-size="14" font-weight="500" fill="var(--ink)">account</text>
				<text x="284" y="146" font-size="12" fill="var(--muted)">name · email · password</text>
			</svg>
			<div class="caption">
				<span class="label">Fig. 0</span>
				<span>An invite link is a single-use token: it opens one account and then stops working.</span>
			</div>
		{:else}
			<svg viewBox="0 0 640 260" width="640" height="260" role="img" aria-label="A spent token matches no account.">
				<rect x="0" y="100" width="190" height="60" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.25" stroke-dasharray="6 4" />
				<text x="14" y="126" font-size="14" font-weight="500" fill="var(--ink)">token (spent)</text>
				<text x="14" y="146" font-size="12" fill="var(--muted)">one use · expires</text>
				<rect x="270" y="100" width="190" height="60" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.25" stroke-dasharray="6 4" />
				<text x="284" y="126" font-size="14" font-weight="500" fill="var(--ink)">account</text>
				<text x="284" y="146" font-size="12" fill="var(--muted)">not created</text>
			</svg>
			<div class="caption">
				<span class="label">Fig. 0</span>
				<span>A used or expired token matches nothing, so no account is made.</span>
			</div>
		{/if}
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
	label {
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
	.figure {
		box-sizing: border-box;
		padding: 96px 96px 64px;
		background: var(--panel);
		border-left: 1px solid var(--ink);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 28px;
	}
	svg {
		display: block;
		max-width: 100%;
		height: auto;
		font-family: var(--font-mono);
	}
	.caption {
		display: flex;
		gap: 24px;
		align-items: baseline;
		max-width: 560px;
		font-size: 17px;
		line-height: 1.5;
		color: var(--body);
	}
	.label {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink);
		white-space: nowrap;
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
		.figure {
			display: none;
		}
	}
</style>
