<script lang="ts">
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();

const multi = $derived(data.multiUser);
// Converting a Local Instance (from Settings) starts at the admin form: the mode is already Local.
const converting = $derived(data.converting);
const onAdmin = $derived(form?.step === 'admin' || converting);
// Only the admin step names a field; a step-1 refusal has none.
const fieldError = (field: 'name' | 'email' | 'password') =>
	form?.step === 'admin' && form.field === field ? form.message : undefined;
const formError = $derived(
	form?.message && !(form.step === 'admin' && form.field) ? form.message : undefined
);
</script>

<svelte:head>
	<title>Set up · BeyondLeetcode</title>
</svelte:head>

<main>
	{#if onAdmin}
		<section class="intro">
			<span class="eyebrow">{converting ? 'Switch to Multi-user' : 'First-run setup · Multi-user'}</span>
			<h1>Create the admin.</h1>
			<p class="lede">
				{converting
					? "This is the first account on the instance. Your Local progress becomes the admin's. This cannot be undone."
					: 'This is the first account on the instance.'}
			</p>
		</section>

		<section class="admin">
			<div class="about">
				<h2>Admin account</h2>
				<p>The admin invites users, resets passwords and sets who can register.</p>
			</div>
			{#if converting && multi.kind !== 'open'}
				<p class="error" role="alert">{multi.kind === 'needs-env' ? multi.message : 'Multi-user is not available on this server.'}</p>
			{/if}
			<form method="POST" action={converting ? '?/admin&convert' : '?/admin'} class="fields">
				<label class="field">
					Name
					<input
						type="text"
						name="name"
						autocomplete="name"
						required
						value={form?.step === 'admin' ? form.name : ''}
						aria-invalid={fieldError('name') ? 'true' : undefined}
						aria-describedby={fieldError('name') ? 'name-error' : undefined}
					/>
					{#if fieldError('name')}<span id="name-error" class="hint" role="alert">{fieldError('name')}</span>{/if}
				</label>
				<label class="field">
					Email
					<input
						type="email"
						name="email"
						autocomplete="email"
						required
						value={form?.step === 'admin' ? form.email : ''}
						aria-invalid={fieldError('email') ? 'true' : undefined}
						aria-describedby={fieldError('email') ? 'email-error' : undefined}
					/>
					{#if fieldError('email')}<span id="email-error" class="hint" role="alert">{fieldError('email')}</span>{/if}
				</label>
				<label class="field">
					Password
					<input
						type="password"
						name="password"
						autocomplete="new-password"
						required
						aria-invalid={fieldError('password') ? 'true' : undefined}
						aria-describedby={fieldError('password') ? 'password-error' : undefined}
					/>
					{#if fieldError('password')}<span id="password-error" class="hint" role="alert">{fieldError('password')}</span>{/if}
				</label>
				{#if formError}
					<p class="error" role="alert">{formError}</p>
				{/if}
				<div class="actions">
					<button type="submit">Create admin account →</button>
					<a class="back" href={converting ? '/settings' : '/setup'}>Back</a>
				</div>
			</form>
		</section>
	{:else}
		<section class="intro">
			<span class="eyebrow">First-run setup</span>
			<h1>Set up this instance.</h1>
			<p class="lede">Choose how this instance is used. You only do this once.</p>
		</section>

		<section class="body">
			<form method="POST" action="?/mode">
				<fieldset>
					<legend>Mode</legend>
					<label class="option local">
						<input type="radio" name="mode" value="local" checked />
						<span class="text">
							<span class="name">Local</span>
							<span class="desc">One person, no login. Everything is saved on this instance for that one learner.</span>
						</span>
					</label>
					<label class="option multi" class:disabled={multi.kind !== 'open'}>
						<input
							type="radio"
							name="mode"
							value="multi"
							disabled={multi.kind !== 'open'}
							aria-describedby={multi.kind === 'open' ? undefined : 'multi-note'}
						/>
						<span class="text">
							<span class="name">Multi-user</span>
							<span class="desc">Several people, each with their own account. You create the admin account next.</span>
							{#if multi.kind === 'needs-env'}
								<span id="multi-note" class="soon">{multi.message}</span>
							{/if}
						</span>
					</label>
				</fieldset>
				{#if form?.message}
					<p class="error" role="alert">{form.message}</p>
				{/if}
				<!-- Both labels are in the page and CSS shows the one for the chosen mode, so no script is needed. -->
				<button type="submit"><span class="start-local">Start in Local mode →</span><span class="continue">Continue →</span></button>
			</form>

			<aside>
				<span class="note">Note 1</span>
				<span>You can change this later from Local to Multi-user. Your Local progress then becomes the first admin's.</span>
			</aside>
		</section>
	{/if}
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
	.option:has(input:checked) {
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
	form:has(input[value='multi']:checked) .start-local,
	form:not(:has(input[value='multi']:checked)) .continue {
		display: none;
	}
	.admin {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		column-gap: 32px;
		row-gap: 32px;
		margin: 56px clamp(16px, 6.7vw, 96px) 72px;
		padding-top: 32px;
		border-top: 1px solid var(--ink);
	}
	.about {
		grid-column: span 4;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-weight: 400;
		font-size: 30px;
		line-height: 1.2;
	}
	.about p {
		margin: 0;
		font-size: 17px;
		line-height: 1.5;
		color: var(--muted);
	}
	.fields {
		grid-column: 6 / span 6;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.field input {
		height: 52px;
		box-sizing: border-box;
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
	.field:has(input[aria-invalid='true']) {
		color: var(--accent);
	}
	.field input[aria-invalid='true'] {
		border: 2px solid var(--accent);
	}
	.hint {
		font-size: 13px;
		letter-spacing: 0;
		text-transform: none;
	}
	.actions {
		display: flex;
		gap: 20px;
		align-items: center;
	}
	.back {
		padding: 12px 0;
		line-height: 20px;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 14px;
	}
	/* Mobile: one column, as on the other screens. */
	@media (max-width: 900px) {
		form,
		aside,
		.about,
		.fields {
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
