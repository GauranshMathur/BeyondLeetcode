import { expect, test } from '@playwright/test';

test('reaching the end of a Chapter marks it Read on the Topic', async ({ page }) => {
	await page.goto('/topics/stacks');
	const chapterRow = page.locator('section.chapter', {
		has: page.getByRole('link', { name: 'An undo log' })
	});
	await expect(chapterRow).toContainText('not read');

	await page.getByRole('link', { name: 'An undo log' }).click();
	await expect(page).toHaveURL('/chapters/stacks-undo-log');
	await expect(page.getByRole('heading', { level: 1, name: 'An undo log' }).first()).toBeVisible();
	await expect(page.getByText('Placeholder fixture text')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Push and size' })).toHaveAttribute(
		'href',
		'/problems/stacks-push'
	);
	await expect(page.getByRole('link', { name: 'Next chapter →' }).first()).toHaveAttribute(
		'href',
		'/chapters/stacks-call-frames'
	);

	// The Read marker on the page updates without a reload.
	await page.locator('main').evaluate((el) => el.lastElementChild?.scrollIntoView());
	await expect(page.locator('aside').getByText('read', { exact: true })).toBeVisible();

	await page.getByRole('link', { name: '← Stacks' }).click();
	await expect(chapterRow).toContainText('read');
	await expect(chapterRow).not.toContainText('not read');
	await expect(page.getByLabel('Topic progress')).toContainText('1 of 2');
});

test('a Locked Topic Chapter returns 403 and an unknown Chapter 404', async ({ page }) => {
	expect((await page.goto('/chapters/queues-print-spooler'))?.status()).toBe(403);
	expect((await page.goto('/chapters/nope'))?.status()).toBe(404);
});
