export const REPO_URL = 'https://github.com/GauranshMathur/BeyondLeetcode';

const BODY = [
	'## What is wrong',
	'',
	'',
	'## Where (sentence, test or code)',
	'',
	'',
	'## Source that shows it',
	''
].join('\n');

/** A prefilled new-issue URL on the repository, titled with the Problem or Chapter and its id. */
export function reportIssueUrl(kind: 'Problem' | 'Chapter', title: string, id: string): string {
	const params = new URLSearchParams({ title: `${kind}: ${title} (${id})`, body: BODY });
	return `${REPO_URL}/issues/new?${params}`;
}
