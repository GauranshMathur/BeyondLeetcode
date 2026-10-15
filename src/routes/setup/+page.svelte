<script lang="ts">
import type { PageProps } from './$types';

let { form }: PageProps = $props();
</script>

<svelte:head>
	<title>Set up · BeyondLeetcode</title>
</svelte:head>

<main>
	<section class="intro">
		<span class="eyebrow">First-run setup</span>
		<h1>Set up this instance.</h1>
		<p class="lede">Choose how this instance is used. You only do this once.</p>
	</section>

	<section class="body">
		<form method="POST">
			<fieldset>
				<legend>Mode</legend>
				<label class="option selected">
					<input type="radio" name="mode" value="local" checked />
					<span class="text">
						<span class="name">Local</span>
						<span class="desc">One person, no login. Everything is saved on this instance for that one learner.</span>
					</span>
				</label>
				<label class="option disabled">
					<input type="radio" name="mode" value="multi" disabled aria-describedby="multi-soon" />
					<span class="text">
						<span class="name">Multi-user</span>
						<span class="desc">Several people, each with their own account. You create the admin account next.</span>
						<span id="multi-soon" class="soon">Multi-user arrives in the next update.</span>
					</span>
				</label>
			</fieldset>
			{#if form?.message}
				<p class="error" role="alert">{form.message}</p>
			{/if}
			<button type="submit">Start in Local mode →</button>
		</form>

		<aside>
			<span class="note">Note 1</span>
			<span>You can change this later from Local to Multi-user. Your Local progress then becomes the first admin's.</span>
		</aside>
	</section>
</main>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 64px clamp(16px, 6.7vw, 96px) 0;
	}
	.eyebrow,
	legend,
	.note {
		font-family: var(--font-mono);
		text-transform: uppercase;
		color: var(--muted);
	}
	.eyebrow {
		font-size: 13px;
		letter-spacing: 0.08em;
	}
	h1 {
		margin: 0;
		font-weight: 400;
		font-size: clamp(36px, 4.5vw, 64px);
		line-height: 1.04;
		letter-spacing: -0.015em;
	}
	.lede {
		margin: 0;
		max-width: 720px;
		font-size: 20px;
		line-height: 1.5;
		color: var(--body);
	}
	.body {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		column-gap: 32px;
		row-gap: 40px;
		padding: 56px clamp(16px, 6.7vw, 96px) 72px;
	}
	form {
		grid-column: 1 / span 7;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	legend {
		padding: 0 0 16px;
		font-size: 13px;
		letter-spacing: 0.06em;
	}
	.option {
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr);
		column-gap: 16px;
		align-items: start;
		padding: 20px 24px;
		border: 1px solid var(--ink);
		border-radius: 2px;
		background: var(--field);
	}
	.option.selected {
		border-width: 2px;
		padding: 19px 23px;
	}
	.option.disabled {
		color: var(--muted);
	}
	input[type='radio'] {
		width: 18px;
		height: 18px;
		margin: 5px 0 0;
		accent-color: var(--ink);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.name {
		font-size: 26px;
		line-height: 1.2;
	}
	.desc {
		font-size: 18px;
		line-height: 1.5;
		color: var(--body);
	}
	.disabled .desc {
		color: var(--muted);
	}
	.soon {
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--muted);
	}
	.error {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--accent);
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
		cursor: pointer;
	}
	aside {
		grid-column: 9 / span 4;
		align-self: start;
		margin-top: 40px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 16px;
		border-top: 1px solid var(--ink);
		font-size: 16px;
		line-height: 1.5;
		color: var(--muted);
	}
	.note {
		font-size: 12px;
		letter-spacing: 0.08em;
		color: var(--accent);
	}
	/* Mobile: one column, as on the other screens. */
	@media (max-width: 900px) {
		form,
		aside {
			grid-column: 1 / -1;
		}
		aside {
			margin-top: 0;
		}
		button {
			align-self: stretch;
		}
	}
</style>
