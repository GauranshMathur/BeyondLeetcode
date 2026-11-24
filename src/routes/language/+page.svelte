<script lang="ts">
import { tick } from 'svelte';
import { LANGUAGES } from '#lib/languages.js';
import { enhance } from '$app/forms';
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();

let group: HTMLFieldSetElement | undefined = $state();

// The nothing-chosen refusal keeps focus on the choice: the first radio.
const keepFocusOnChoice =
	() =>
	async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
		await update();
		if (result.type === 'failure') {
			await tick();
			group?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
		}
	};

const refused = $derived(form?.message !== undefined);
</script>

<svelte:head>
	<title>Starting Language · BeyondLeetcode</title>
</svelte:head>

<main>
	<section class="intro">
		<span class="eyebrow">Before your first Problem</span>
		<h1>Which Language do you start with?</h1>
		<p class="lede">Choose one. Your first Problem opens in it.</p>
	</section>
	<section class="body">
		<form method="POST" use:enhance={keepFocusOnChoice}>
			<input type="hidden" name="next" value={data.next} />
			<fieldset bind:this={group} aria-describedby={refused ? 'language-error' : undefined}>
				<legend class:refused>Starting Language</legend>
				{#if refused}
					<span id="language-error" class="error" role="alert">{form?.message}</span>
				{/if}
				{#each LANGUAGES as language (language.id)}
					<label class="choice">
						<!-- Every radio is marked invalid after a refusal, as the board draws it; the error text reaches a screen reader through the fieldset's aria-describedby. -->
						<!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
						<input
							type="radio"
							name="language"
							value={language.id}
							aria-invalid={refused ? 'true' : undefined}
						/>
						<span>{language.name}</span>
					</label>
				{/each}
			</fieldset>
			<button type="submit">Continue →</button>
		</form>
		<aside>
			<span class="note-label">Note 1</span>
			<span>You can change this later in Settings, and for each Topic.</span>
		</aside>
		<p class="offer">New here? <a href="/guide">How to use the site</a></p>
	</section>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 64px 96px 0;
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
		font-size: 64px;
		line-height: 1.04;
		letter-spacing: -0.015em;
		color: var(--ink);
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
		padding: 56px 96px 72px;
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
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	legend {
		padding: 0 0 16px;
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	legend.refused {
		padding-bottom: 8px;
		color: var(--accent);
	}
	.error {
		font-size: 16px;
		line-height: 1.5;
		color: var(--accent);
	}
	.choice {
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr);
		column-gap: 16px;
		align-items: center;
		min-height: 64px;
		box-sizing: border-box;
		padding: 12px 24px;
		border: 1px solid var(--ink);
		border-radius: 2px;
		background: var(--field);
		color: var(--ink);
		cursor: pointer;
	}
	.choice input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--ink);
	}
	.choice span {
		font-size: 26px;
		line-height: 1.2;
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
	.offer {
		grid-column: 1 / span 7;
		margin: 32px 0 0;
		font-size: 16px;
		line-height: 1.5;
		color: var(--muted);
	}
	.offer a {
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 3px;
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
	.note-label {
		font-family: var(--font-mono);
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
	}
	/* The phone board: one column, the note under the button, rows and button at least 44px. */
	@media (max-width: 767.98px) {
		.intro {
			gap: 8px;
			padding: 32px var(--size-gutter) 0;
		}
		.eyebrow {
			font-size: 12px;
		}
		h1 {
			font-size: var(--size-h1-phone);
			line-height: 1.08;
			letter-spacing: -0.01em;
		}
		.lede {
			font-size: 18px;
			line-height: 1.6;
		}
		.body {
			display: flex;
			flex-direction: column;
			gap: 20px;
			padding: 20px var(--size-gutter) 32px;
		}
		form {
			gap: 20px;
		}
		fieldset {
			gap: 12px;
		}
		legend {
			font-size: 12px;
		}
		.choice {
			min-height: 56px;
			padding: 12px 16px;
		}
		.choice span {
			font-size: 22px;
		}
		button {
			align-self: stretch;
			height: 48px;
			padding: 0 20px;
			font-size: 14px;
		}
		.offer {
			margin: 0;
		}
		.offer a {
			display: inline-flex;
			align-items: center;
			min-height: 44px;
		}
		aside {
			margin-top: 0;
			padding-top: 0;
			border-top: 0;
		}
	}
</style>
