<script lang="ts">
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();

// A wrong sign-in marks both fields and puts its one message under the password, as the board draws it.
// Any other failure has nothing to do with the fields, so its message goes above the button.
const wrong = $derived(form?.wrong === true);
const failure = $derived(form && !form.wrong ? form.message : undefined);
</script>

<svelte:head>
	<title>Sign in · BeyondLeetcode</title>
</svelte:head>

<main>
	<div class="left">
		<form method="POST" class="block">
			<header class="intro">
				<h1>Welcome back.</h1>
				<p class="lede">Pick up exactly where you left off.</p>
			</header>
			<div class="field">
				<label for="email">Email</label>
				<input
					id="email"
					type="email"
					name="email"
					autocomplete="email"
					required
					value={form?.email ?? ''}
					aria-invalid={wrong ? 'true' : undefined}
					aria-describedby={wrong ? 'si-err' : undefined}
				/>
			</div>
			<div class="field">
				<label for="password">Password</label>
				<input
					id="password"
					type="password"
					name="password"
					autocomplete="current-password"
					required
					aria-invalid={wrong ? 'true' : undefined}
					aria-describedby={wrong ? 'si-err' : undefined}
				/>
				{#if wrong}<span id="si-err" class="hint" role="alert">{form?.message}</span>{/if}
			</div>
			{#if failure}
				<p class="error" role="alert">{failure}</p>
			{:else if data.notice}
				<p class="error" role="alert">{data.notice}</p>
			{/if}
			<div class="actions">
				<button type="submit">Sign in →</button>
				<span class="forgot">Forgot password? Ask your admin.</span>
			</div>
			<!-- One button per provider the Instance has (none unless both of its variables are set). They post
				to this same form with their id and skip the email and password checks. -->
			{#if data.providers.length > 0}
				<div class="or" aria-hidden="true"><span class="rule"></span><span>or</span><span class="rule"></span></div>
				<div class="providers">
					{#each data.providers as provider (provider.id)}
						<button type="submit" name="provider" value={provider.id} formnovalidate class="outline">
							Continue with {provider.name}
						</button>
					{/each}
				</div>
			{/if}
		</form>
		<!-- The link is only there while anyone may sign up; invite-only Instances have no public sign-up. -->
		{#if data.open}
			<p class="switch">New here? <a href="/signup">Create an account</a></p>
		{/if}
	</div>

	<aside class="figure">
		<svg
			viewBox="0 0 640 320"
			width="640"
			height="320"
			role="img"
			aria-label="A session token is looked up in the session table. The row it finds names your account, which holds your progress."
		>
			<rect class="box" x="0" y="130" width="150" height="60" />
			<text class="name" x="14" y="156">session</text>
			<text class="note" x="14" y="176">token 9f2c…</text>
			<line class="link" x1="150" y1="160" x2="226" y2="160" />
			<polyline class="link" points="220,155 227,160 220,165" fill="none" />
			<text class="note small" x="160" y="148">lookup</text>
			{#each [20, 55, 90, 125, 195, 230, 265] as y (y)}
				<rect class="box" x="230" {y} width="110" height="35" />
			{/each}
			<rect class="box hit" x="230" y="160" width="110" height="35" />
			<text class="hit-label" x="244" y="182">session row</text>
			<line class="link hit" x1="340" y1="178" x2="416" y2="178" />
			<polyline class="link hit" points="410,173 417,178 410,183" fill="none" />
			<rect class="box hit" x="420" y="140" width="210" height="76" />
			<text class="hit-label name" x="436" y="168">your account</text>
			<text class="note" x="436" y="190">chapters read</text>
			<text class="note" x="436" y="206">problems solved</text>
		</svg>
		<p class="caption">
			<span class="fig">Fig. 0</span>
			<span>Your session cookie holds a token. Each page the server looks that token up in its session table; the row it finds names your account, and your account holds your progress.</span>
		</p>
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
	/* The form sits between the top and the "new here" line, as the board centres it. */
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
	button {
		white-space: nowrap;
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
	.or {
		display: flex;
		gap: 16px;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--muted);
	}
	.rule {
		flex-grow: 1;
		height: 1px;
		background: var(--rule);
	}
	.providers {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	button.outline {
		background: transparent;
		color: var(--ink);
		border: 1px solid var(--ink);
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
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 12px 24px;
	}
	.forgot {
		font-size: 18px;
		color: var(--body);
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
	.box {
		fill: var(--paper);
		stroke: var(--ink);
		stroke-width: 1.25;
	}
	.link {
		stroke: var(--ink);
		stroke-width: 1.25;
	}
	.hit {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.link.hit {
		stroke-width: 1.5;
	}
	text {
		font-size: 12px;
		fill: var(--ink);
	}
	.name {
		font-size: 14px;
		font-weight: 500;
	}
	.note {
		fill: var(--muted);
	}
	.small {
		font-size: 11px;
	}
	.hit-label {
		fill: var(--accent);
	}
	.caption {
		margin: 0;
		display: flex;
		gap: 24px;
		align-items: baseline;
		max-width: 560px;
		font-size: 17px;
		line-height: 1.5;
		color: var(--body);
	}
	.fig {
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
		button {
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
		.actions {
			flex-direction: column;
			align-items: stretch;
			gap: 20px;
		}
		.forgot {
			font-size: 16px;
			line-height: 1.5;
			color: var(--muted);
		}
	}
</style>
