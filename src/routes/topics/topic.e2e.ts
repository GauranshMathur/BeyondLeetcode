import { expect, test } from '@playwright/test';
import { asLearner } from '../../lib/e2e-learner.ts';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ storageState: asLearner('e2e-topic') });

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

test.describe('mobile layout', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('shows progress, read state, Problem rows and no sideways scroll', async ({ page }) => {
		// Read the first Chapter to its end, so the Topic shows one read and one unread Chapter.
		await page.goto('/chapters/stacks-undo-log');
		// Below 768 px the Chapter hides its read marker, so wait for the mark itself to be saved.
		const marked = page.waitForResponse(/\?\/reachEnd/);
		await page.locator('main').evaluate((el) => el.lastElementChild?.scrollIntoView());
		await marked;
		await page.goto('/topics/stacks');
		await expect(page.getByLabel('Topic progress')).toContainText('chapters read');
		await expect(page.getByLabel('Topic progress')).toContainText('extra solved · not counted');
		await expect(page.getByText('not read', { exact: true })).toHaveCount(1);
		await expect(page.locator('.read', { hasText: /^\s*read\s*$/ })).toHaveCount(1);

		const rows = page.locator('.rows a');
		expect(await rows.count()).toBeGreaterThan(1);
		await expect(rows.first()).toContainText('core');
		await expect(rows.first()).toContainText('step 01');
		await expect(page.locator('.rows').getByText('extra').first()).toBeVisible();
		await expect(rows.first()).toContainText('—');

		for (const row of await rows.all()) {
			const box = await row.boundingBox();
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});
