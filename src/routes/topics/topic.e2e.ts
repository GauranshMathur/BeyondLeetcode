import { expect, test } from '@playwright/test';

test('Map to an Unlocked Topic shows its Chapters and Problems', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: /^Stacks, unlocked/ }).click();
	await expect(page).toHaveURL('/topics/stacks');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stacks');
	await expect(page.getByRole('link', { name: 'An undo log' })).toHaveAttribute(
		'href',
		'/chapters/stacks-undo-log'
	);
	await expect(page.getByRole('link', { name: 'Call frames' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Push and size' })).toHaveAttribute(
		'href',
		'/problems/stacks-push'
	);
	await expect(page.getByRole('link', { name: 'Peek' })).toBeVisible();
	await expect(page.getByText('not read').first()).toBeVisible();
	await expect(page.getByLabel('Topic progress')).toContainText('core solved');
	await expect(page.getByLabel('Topic progress')).toContainText('0 of 2');
	await expect(page.getByLabel('Topic progress')).toContainText('extra solved · not counted');

	// The Map link is the current page only on the Map.
	await expect(page.getByRole('link', { name: 'Map', exact: true })).not.toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('a Locked Topic returns 403', async ({ page }) => {
	const response = await page.goto('/topics/queues');
	expect(response?.status()).toBe(403);
});

test('an unknown Topic returns 404', async ({ page }) => {
	const response = await page.goto('/topics/nope');
	expect(response?.status()).toBe(404);
});
