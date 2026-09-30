import { expect, test } from '@playwright/test';

test('the Map shows Unlocked and Locked Topics from the fixture content', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Every topic, in the order it builds.'
	);

	// Stacks has no Prerequisites, so it is Unlocked and links on to its Topic page.
	const stacks = page.getByRole('link', { name: 'Stacks, unlocked, 0 of 2 core problems solved' });
	await expect(stacks).toHaveAttribute('href', '/topics/stacks');

	// Queues and Heaps wait on Prerequisites: Locked, and not links.
	await expect(page.getByRole('img', { name: /^Queues, locked/ })).toBeVisible();
	await expect(page.getByRole('img', { name: /^Heaps, locked/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Queues/ })).toHaveCount(0);

	await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText('Local');
});

test('an Unlocked Topic can be reached with the keyboard', async ({ page }) => {
	await page.goto('/');
	const stacks = page.getByRole('link', { name: /^Stacks, unlocked/ });
	await stacks.focus();
	await expect(stacks).toBeFocused();
});
