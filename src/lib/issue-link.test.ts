import { describe, expect, it } from 'vitest';
import { REPO_URL, reportIssueUrl } from './issue-link';

describe('reportIssueUrl', () => {
	it('opens a new issue on the repository with the title and body prefilled', () => {
		const url = new URL(reportIssueUrl('Problem', 'Push and size', 'stacks-push'));
		expect(`${url.origin}${url.pathname}`).toBe(
			'https://github.com/GauranshMathur/BeyondLeetcode/issues/new'
		);
		expect(REPO_URL).toBe('https://github.com/GauranshMathur/BeyondLeetcode');
		expect(url.searchParams.get('title')).toBe('Problem: Push and size (stacks-push)');
		const body = url.searchParams.get('body') ?? '';
		expect(body).toContain('What is wrong');
		expect(body).toContain('Where (sentence, test or code)');
		expect(body).toContain('Source that shows it');
	});

	it('names a Chapter and encodes special characters in the title', () => {
		const url = new URL(reportIssueUrl('Chapter', 'Queues & "pairs" #1', 'queues-a'));
		expect(url.searchParams.get('title')).toBe('Chapter: Queues & "pairs" #1 (queues-a)');
		expect(url.searchParams.has('labels')).toBe(false);
	});
});
