import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	page: { status: 500, error: undefined as unknown } as { status: number; error: unknown }
}));
vi.mock('$app/state', () => ({
	get page() {
		return state.page;
	}
}));

const { default: ErrorPage } = await import('./+error.svelte');

const renderPage = (status: number, error: unknown) => {
	state.page = { status, error };
	return render(ErrorPage);
};

beforeEach(() => {
	state.page = { status: 500, error: undefined };
});

describe('the error page for content that fails validation', () => {
	it('shows each issue as one list item under the heading', () => {
		const first = 'content.json: not valid JSON';
		const second = 'topics/x/chapters/y/chapter.md: ✖ Too small\n  → at title';
		const { body, head } = renderPage(500, {
			message: 'Invalid content',
			contentIssues: [first, second]
		});

		expect(body).toMatch(/<h1[^>]*>Invalid content<\/h1>/);
		expect(head).toContain('<title>Invalid content · BeyondLeetcode</title>');
		const items = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
		expect(items).toEqual([first, second]);
	});

	it('has no list for an ordinary error', () => {
		const { body } = renderPage(500, { message: 'Internal Error' });

		expect(body).toMatch(/<h1[^>]*>Internal Error<\/h1>/);
		expect(body).not.toContain('<ul');
	});

	it('writes an issue with markup in it as escaped text', () => {
		const { body } = renderPage(500, {
			message: 'Invalid content',
			contentIssues: ['topics/<script>alert(1)</script>/topic.json: missing file']
		});

		expect(body).toContain('&lt;script');
		expect(body).not.toContain('<script>');
	});
});
