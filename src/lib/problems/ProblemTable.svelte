<script lang="ts" module>
export type ProblemTableRow = { id: string; title: string; kind: string; status: string };
export type ProblemTableLabels = { problem: string; set: string; status: string };
</script>

<script lang="ts">
// A list of Problems, each drawn once: a table on a desktop, numbered rows on a phone whose
// title link covers the row. The caller owns the wording (column labels and the set and
// status texts), so a page keeps its own words at each width.
let {
	problems,
	labels,
	setText,
	statusText
}: {
	problems: readonly ProblemTableRow[];
	labels: ProblemTableLabels;
	setText: (problem: ProblemTableRow) => string;
	statusText: (problem: ProblemTableRow) => string;
} = $props();
</script>

<table class="problems">
	<thead>
		<tr>
			<th scope="col">{labels.problem}</th>
			<th scope="col">{labels.set}</th>
			<th scope="col" class="status">{labels.status}</th>
		</tr>
	</thead>
	<tbody>
		{#each problems as problem (problem.id)}
			<tr>
				<td class="title"><a class="ptitle" href="/problems/{problem.id}">{problem.title}</a></td>
				<td><span class={problem.kind === 'Core' ? 'core' : 'muted upper'}>{setText(problem)}</span></td>
				<td class="status muted">{statusText(problem)}</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.muted {
		color: var(--muted);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-mono);
		font-size: 13px;
	}
	th {
		text-align: left;
		padding: 0 16px 12px 0;
		font-weight: 500;
		color: var(--muted);
		border-bottom: 1px solid var(--ink);
	}
	td {
		padding: 20px 16px 20px 0;
		border-bottom: 1px solid var(--rule);
	}
	tr:last-child td {
		border-bottom-color: var(--ink);
	}
	td.title {
		padding-top: 10px;
		padding-bottom: 10px;
	}
	.status {
		text-align: right;
		padding-right: 0;
	}
	.ptitle {
		color: var(--ink);
		font-family: var(--font-serif);
		font-size: 21px;
		text-decoration: none;
		display: inline-block;
		padding: 10px 0;
	}
	.ptitle:hover {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-underline-offset: 6px;
	}
	.core {
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-bottom: 2px solid var(--ink);
		padding-bottom: 2px;
	}
	.upper {
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	/* Phone: numbered rows; the whole row is the title link. */
	@media (max-width: 767.98px) {
		table.problems,
		table.problems tbody {
			display: block;
		}
		table.problems {
			border-top: 1px solid var(--ink);
			counter-reset: row;
		}
		table.problems thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
		}
		table.problems tr {
			position: relative;
			display: grid;
			grid-template-columns: 40px auto minmax(0, 1fr);
			column-gap: 0;
			align-items: baseline;
			padding: 16px 0;
			border-bottom: 1px solid var(--rule);
		}
		table.problems tbody tr {
			counter-increment: row;
		}
		table.problems tr:last-child {
			border-bottom-color: var(--ink);
		}
		table.problems td,
		table.problems td.title {
			padding: 0;
			border: 0;
			font-size: 13px;
			color: var(--muted);
		}
		table.problems td.title {
			grid-column: 1 / -1;
			display: grid;
			grid-template-columns: 40px minmax(0, 1fr);
			column-gap: 0;
			align-items: baseline;
			padding-bottom: 6px;
		}
		table.problems td.title::before {
			content: counter(row, decimal-leading-zero);
			font-size: 14px;
			color: var(--muted);
		}
		table.problems td:nth-child(2) {
			grid-column: 2;
		}
		table.problems td.status {
			grid-column: 3;
			text-align: left;
		}
		table.problems td.status::before {
			content: '·';
			padding: 0 8px;
		}
		.ptitle {
			padding: 0;
			line-height: 1.25;
		}
		.ptitle::after {
			content: '';
			position: absolute;
			inset: 0;
		}
		.core {
			color: var(--ink);
		}
	}
</style>
