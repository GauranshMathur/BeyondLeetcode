// Every media query a screen may use, named once. breakpoints.test.ts reads each `@media` in src and fails
// on any other query, or on a named one outside its files. CSS cannot import a constant without a build
// step, so the queries stay written out in the styles; this is the list they are held to.

export const PHONE = '(max-width: 767.98px)';

const PROBLEM = [
	'src/routes/problems/[problemId]/+page.svelte',
	'src/routes/problems/[problemId]/ProblemWorkspace.svelte',
	'src/routes/problems/[problemId]/ResultsPanel.svelte'
];

export const PROBLEM_MIDDLE = '(width > 767.98px) and (width <= 900px)';
export const PROBLEM_WIDE = '(width > 900px)';
export const NARROW_900 = '(max-width: 900px)';
export const NARROW_800 = '(max-width: 800px)';
export const ACCOUNT_FORMS_NARROW_DESKTOP = '(max-width: 1100px)';

/** A query that any file may use. */
export const ANYWHERE = [PHONE] as const;

/** A query tied to the only files that may use it. */
export const TIED: Record<string, readonly string[]> = {
	// The Problem screen's bar lives in AppHeader since C167, with its middle-width rules.
	[PROBLEM_MIDDLE]: [...PROBLEM, 'src/lib/header/AppHeader.svelte'],
	[PROBLEM_WIDE]: PROBLEM,
	[NARROW_900]: ['src/routes/setup/+page.svelte', 'src/routes/problems/[problemId]/+page.svelte'],
	[NARROW_800]: [
		'src/routes/settings/+page.svelte',
		'src/routes/users/+page.svelte',
		'src/routes/account/password/+page.svelte'
	],
	[ACCOUNT_FORMS_NARROW_DESKTOP]: [
		'src/routes/signin/+page.svelte',
		'src/routes/signup/+page.svelte',
		'src/routes/invite/[token]/+page.svelte'
	]
};

/** Split an `@media` prelude into its comma-separated queries, normalised. */
export function queriesOf(prelude: string): string[] {
	return prelude
		.replace(/^@media/, '')
		.split(',')
		.map((q) => q.trim().replace(/\s+/g, ' '))
		.filter(Boolean);
}

/** The problems with one file's `@media` preludes, empty when it holds to the named queries. */
export function breakpointProblems(file: string, source: string): string[] {
	const problems: string[] = [];
	for (const [prelude] of source.matchAll(/@media[^{]*/g)) {
		for (const query of queriesOf(prelude)) {
			if ((ANYWHERE as readonly string[]).includes(query)) continue;
			const files = TIED[query];
			if (!files) problems.push(`${file}: "${query}" is not a named breakpoint`);
			else if (!files.includes(file))
				problems.push(`${file}: "${query}" is tied to ${files.join(', ')}`);
		}
	}
	return problems;
}
