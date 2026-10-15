<script lang="ts">
import type { PageProps } from './$types';

let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Users · BeyondLeetcode</title>
</svelte:head>

<main>
	<section class="intro">
		<span class="eyebrow">Admin</span>
		<h1>Users</h1>
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
	/* The table keeps its columns; a narrow screen scrolls it sideways instead of the page. */
	.scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		min-width: 720px;
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
