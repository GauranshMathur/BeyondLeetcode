import { expect, test } from '@playwright/test';
import { asLearner } from '../../lib/e2e-learner.ts';
import { expectNoSidewaysScroll, expectTargets, phone } from '../../lib/e2e-phone.ts';
import { gotoHydrated } from '../../lib/test/hydrated.ts';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ storageState: asLearner('e2e-guide') });

const TERMS = [
	'Topic',
	'Chapter',
	'Problem',
	'Build',
	'Hints',
	'Run',
	'Submit',
	'Solved',
	'Complete',
	'Locked and Unlocked'
];

test('the Guide has a heading for each thing it explains', async ({ page }) => {
	const response = await gotoHydrated(page, '/guide');
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 1, name: 'How to use the site' })).toBeVisible();
	for (const term of TERMS) {
		await expect(page.getByRole('heading', { name: term, exact: true })).toBeVisible();
	}
	await expect(page.getByRole('heading', { level: 2, name: /Progress and unlocks/ })).toBeVisible();
	await expect(
		page.getByRole('heading', { level: 2, name: /Run, Submit and hints/ })
	).toBeVisible();
});

test('the contents list jumps to its section and the Map link opens the Map', async ({ page }) => {
	await gotoHydrated(page, '/guide');
	await page
		.getByRole('navigation', { name: 'On this page' })
		.getByRole('link', { name: 'Progress and unlocks' })
		.click();
	await expect(page).toHaveURL(/#s5$/);
	await page.getByRole('link', { name: 'Open the Map →' }).click();
	await expect(page).toHaveURL('/');
});

test("the header's Guide link opens the Guide from the Map", async ({ page }) => {
	await gotoHydrated(page, '/');
	await page
		.getByRole('navigation', { name: 'Primary' })
		.getByRole('link', { name: 'Guide' })
		.click();
	await expect(page).toHaveURL('/guide');
	await expect(page.getByRole('heading', { level: 1, name: 'How to use the site' })).toBeVisible();
});

test.describe('on a phone', () => {
	test.use(phone);

	test("the header's Guide link opens the Guide from the Map", async ({ page }) => {
		await gotoHydrated(page, '/');
		await page
			.getByRole('navigation', { name: 'Primary' })
			.getByRole('link', { name: 'Guide' })
			.click();
		await expect(page).toHaveURL('/guide');
	});

	test('the Guide has no sideways scroll and every link is a full-size target', async ({
		page
	}) => {
		await gotoHydrated(page, '/guide');
		await expectNoSidewaysScroll(page);
		await expectTargets(page.getByRole('main'), 44);
	});
});
