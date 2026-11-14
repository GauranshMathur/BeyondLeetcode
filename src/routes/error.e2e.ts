import { expect, test } from '@playwright/test';
import { asLearner } from '../lib/e2e-learner.ts';
import { expectNoSidewaysScroll, expectTargets, phone } from '../lib/e2e-phone.ts';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ storageState: asLearner('e2e-error') });

for (const [name, path, status, heading, message] of [
	[
		'an unknown path',
		'/no/such/page',
		404,
		'Not found',
		'That page does not exist. The link may be old.'
	],
	[
		'a Locked Topic',
		'/topics/queues',
		403,
		'This Topic is locked.',
		'Complete its Prerequisites on the Map to open it.'
	]
] as const) {
	test(`${name} reads as sentences, with one main and one h1`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(status);

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
		await expect(page.getByText(message, { exact: true })).toBeVisible();
		await expect(page).toHaveTitle(`${heading} · BeyondLeetcode`);
		await expect(page.getByRole('main')).toHaveCount(1);
		await expect(page.getByText(`Error ${status}`)).toBeVisible();
		await expect(page.getByText('TopicLocked')).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Back to the Map' })).toHaveAttribute('href', '/');
	});
}

test.describe('the error page on a phone', () => {
	test.use(phone);

	test('has a full-width 48px link and no sideways scroll', async ({ page }) => {
		await page.goto('/no/such/page');
		const link = page.getByRole('link', { name: 'Back to the Map' });
		await expect(link).toBeVisible();
		const box = await link.boundingBox();
		expect(box?.height).toBe(48);
		expect(box?.width).toBeGreaterThan(300);
		await expectTargets(page.getByRole('main'), 44);
		await expectNoSidewaysScroll(page);
	});
});
