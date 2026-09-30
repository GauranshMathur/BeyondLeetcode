import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

describe('placeholder page', () => {
	it('renders the product name as its heading', () => {
		const { body } = render(Page);
		expect(body).toMatch(/<h1[^>]*>DeliberatelyWrong<\/h1>/);
	});
});
