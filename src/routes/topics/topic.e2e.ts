import { expect, test } from '@playwright/test';
import { asLearner } from '../../lib/e2e-learner.ts';
import { expectNoSidewaysScroll, expectTargets, phone, readToEnd } from '../../lib/e2e-phone.ts';
import { gotoHydrated } from '../../lib/test/hydrated.ts';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ storageState: asLearner('e2e-topic') });

test('Map to an Unlocked Topic shows its Chapters and Problems', async ({ page }) => {
	await gotoHydrated(page, '/');
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

test.describe('the Topic on a phone', () => {
	test.use(phone);

	test('shows progress, read state, Problem rows and no sideways scroll', async ({ page }) => {
		// Read the first Chapter to its end, so the Topic shows one read and one unread Chapter.
		await readToEnd(page, () => gotoHydrated(page, '/chapters/stacks-undo-log'));
		await gotoHydrated(page, '/topics/stacks');
		await expect(page.getByLabel('Topic progress')).toContainText('chapters read');
		await expect(page.getByLabel('Topic progress')).toContainText('extra solved · not counted');
		await expect(page.getByText('not read', { exact: true })).toHaveCount(1);
		await expect(page.locator('.read', { hasText: /^\s*read\s*$/ })).toHaveCount(1);

		const rows = page.locator('table.problems tbody tr');
		expect(await rows.count()).toBeGreaterThan(1);
		await expect(rows.first()).toContainText('1.1');
		await expect(rows.first()).toContainText('core · step 01');
		await expect(
			page.locator('table.problems').getByText('extra · off step').first()
		).toBeVisible();
		await expect(rows.first()).toContainText('—');
		await expect(rows.first().getByRole('link')).toHaveText('Push and size');

		await expectTargets(page.locator('table.problems'), 44);
		await expectNoSidewaysScroll(page);
	});
});

// C51: tagged @mobile, so the "mobile" project also runs it at 390 x 844 (see playwright.config.ts).
test.describe('the Topic on a phone, as a flow', () => {
	test.use({ storageState: asLearner('e2e-topic-flow') });

	test('a Chapter and a Problem are reached by tapping their rows', { tag: '@mobile' }, async ({
		page
	}) => {
		await gotoHydrated(page, '/topics/stacks');
		await page.getByRole('link', { name: 'An undo log' }).tap();
		await expect(page).toHaveURL('/chapters/stacks-undo-log');

		await page.goBack();
		await expect(page).toHaveURL('/topics/stacks');
		await page.getByRole('link', { name: 'Push and size' }).tap();
		await expect(page).toHaveURL('/problems/stacks-push');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Push and size');
	});
});
