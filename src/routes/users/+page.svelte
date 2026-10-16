<script lang="ts">
import type { SubmitFunction } from '@sveltejs/kit';
import { enhance } from '$app/forms';
import type { PageProps } from './$types';

let { data, form }: PageProps = $props();

// Without JavaScript the select needs its button; with it, choosing submits.
let enhanced = $state(false);
$effect(() => {
	enhanced = true;
});

const explanation = {
	invite: 'Invite only: a new account needs an invite link from you.',
	open: 'Open: anyone who can reach this instance can create an account.'
};

// A refused or failed switch changed nothing: the select goes back to what the Instance holds, so it
// never shows a mode that is not in force.
const switchRegistration: SubmitFunction = ({ formElement }) => {
	return async ({ result, update }) => {
		await update({ reset: false });
		const select = formElement.elements.namedItem('registration');
		if (result.type !== 'success' && select instanceof HTMLSelectElement) {
			select.value = data.registration;
		}
	};
};
</script>

<svelte:head>
	<title>Users · BeyondLeetcode</title>
</svelte:head>

<main>
	<section class="intro">
		<span class="eyebrow">Admin</span>
		<h1>Users</h1>
	</section>

	<section class="setting">
		<div class="label">
			<h2>Registration</h2>
			<p>Who can create an account.</p>
		</div>
		<form class="control" method="POST" action="?/registration" use:enhance={switchRegistration}>
			<label>
				Registration
				<select
					name="registration"
					onchange={(e) => enhanced && e.currentTarget.form?.requestSubmit()}
				>
					<option value="invite" selected={data.registration === 'invite'}>Invite only</option>
					<option value="open" selected={data.registration === 'open'}>Open</option>
				</select>
			</label>
			{#if !enhanced}
				<button type="submit">Save registration</button>
			{/if}
			<p class="lead" aria-live="polite">{explanation[data.registration]}</p>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		</form>
	</section>

	<section class="group">
		<h2 id="all-users">All users</h2>
		<div class="scroll">
			<table aria-labelledby="all-users">
				<thead>
					<tr>
						<th scope="col">name</th>
						<th scope="col">email</th>
						<th scope="col" class="role">role</th>
						<th scope="col" class="joined">joined</th>
						<th scope="col" class="actions">actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.accounts as account (account.id)}
						<tr>
							<td>
								<span class="name">{account.name}</span>
								{#if account.you}<span class="you">you</span>{/if}
							</td>
							<td>{account.email}</td>
							<td>{account.role}</td>
							<td><time datetime={account.joined}>{account.joined.slice(0, 10)}</time></td>
							<td class="actions">
								<!-- Reset password (C36a) and Remove (C37) land here. F.15 draws no dead buttons, so until
									they work a row shows none; the admin's own row says why it never gets Remove. -->
								{#if account.you}<span class="why">you cannot remove yourself</span>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
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
	.group {
		display: flex;
		flex-direction: column;
		gap: 24px;
		margin: 56px clamp(16px, 6.7vw, 96px) 0;
		padding-top: 32px;
		border-top: 1px solid var(--ink);
	}
	h2 {
		margin: 0;
		font-weight: 400;
		font-size: 30px;
		line-height: 1.2;
	}
	.setting {
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
	.label p {
		margin: 0;
		font-size: 17px;
		line-height: 1.5;
		color: var(--muted);
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
	.control label {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.control select {
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
	.control button {
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
	.lead {
		margin: 0;
		font-size: 18px;
		line-height: 1.5;
		color: var(--body);
	}
	.error {
		margin: 0;
		color: var(--accent);
	}
	/* The table keeps its columns; a narrow screen scrolls it sideways instead of the page. */
	.scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		min-width: 900px;
		border-collapse: collapse;
		font-size: 20px;
	}
	th {
		text-align: left;
		padding: 0 16px 12px 0;
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 500;
		color: var(--muted);
		border-bottom: 1px solid var(--ink);
	}
	th.role {
		width: 120px;
	}
	th.joined {
		width: 180px;
	}
	th.actions {
		width: 300px;
		text-align: right;
		padding-right: 0;
	}
	tbody {
		font-family: var(--font-mono);
		font-size: 13px;
	}
	td {
		padding: 12px 16px 12px 0;
		vertical-align: middle;
		color: var(--body);
		border-bottom: 1px solid var(--rule);
		overflow-wrap: anywhere;
	}
	td.actions {
		text-align: right;
		padding-right: 0;
	}
	.name {
		font-family: var(--font-serif);
		font-size: 21px;
		color: var(--ink);
	}
	.you,
	.why {
		color: var(--muted);
	}
</style>
