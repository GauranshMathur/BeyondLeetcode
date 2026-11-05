import { expect, test } from '@playwright/test';
import { asLearner } from '../lib/e2e-learner.ts';
import { phone } from '../lib/e2e-phone.ts';
import { gotoHydrated } from '../lib/test/hydrated.ts';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ storageState: asLearner('e2e-wordmark') });

// C173: where the wordmark reads "BLC" its name starts with that text and says where it goes (WCAG 2.5.3).
test.describe('on a phone', () => {
	test.use({ ...phone });

	test('the Map wordmark is named "BLC, Beyond Leetcode Map" and links to /', async ({ page }) => {
		await gotoHydrated(page, '/');
		await expect(
			page.getByRole('link', { name: 'BLC, Beyond Leetcode Map', exact: true })
		).toHaveAttribute('href', '/');
	});
});

test.describe('at 1440 px', () => {
	test.use({ viewport: { width: 1440, height: 1000 } });

	test('the Map wordmark keeps its name "Beyond Leetcode"', async ({ page }) => {
		await gotoHydrated(page, '/');
		await expect(page.getByRole('link', { name: 'Beyond Leetcode', exact: true })).toHaveAttribute(
			'href',
			'/'
		);
	});

	test('the Problem wordmark is named "BLC, Beyond Leetcode Map" and links to /', async ({
		page
	}) => {
		await gotoHydrated(page, '/problems/stacks-push');
		await expect(
			page.getByRole('link', { name: 'BLC, Beyond Leetcode Map', exact: true })
		).toHaveAttribute('href', '/');
	});
});
