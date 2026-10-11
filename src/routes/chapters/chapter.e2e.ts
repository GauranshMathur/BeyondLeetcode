import { expect, test } from '@playwright/test';
import { asLearner } from '../../lib/e2e-learner.ts';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ storageState: asLearner('e2e-chapter') });

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

test('a Chapter links to a prefilled new GitHub issue in a new tab', async ({ page }) => {
	await page.goto('/chapters/stacks-undo-log');
	const link = page.getByRole('link', { name: /Report an issue/ });
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	const url = new URL((await link.getAttribute('href')) ?? '');
	expect(`${url.origin}${url.pathname}`).toBe(
		'https://github.com/GauranshMathur/BeyondLeetcode/issues/new'
	);
	expect(url.searchParams.get('title')).toBe('Chapter: An undo log (stacks-undo-log)');
	expect(url.searchParams.get('body')).toContain('Source that shows it');
});
