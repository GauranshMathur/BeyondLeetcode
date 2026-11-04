import { expect, type Page, test } from '@playwright/test';
import { gotoHydrated } from '../lib/test/hydrated.ts';

// Sign up and Accept invite switch to their phone layout at 767.98px, the one phone query, as Sign in does.
// They run on the Multi-user server (4174), which is invite-only: Sign up shows its closed state and an
// unknown invite token shows the spent-token state, and both keep their side panel on a wide screen.

const sideways = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const forms = [
	{
		name: 'Sign up',
		path: '/signup',
		panel: 'What an account keeps'
	},
	{
		name: 'Accept invite',
		path: '/invite/not-a-real-token',
		panel: 'A used or expired token matches nothing, so no account is made.'
	}
];

for (const form of forms) {
	test.describe(form.name, () => {
		test('keeps the side panel and does not scroll sideways at 768 px', async ({ page }) => {
			await page.setViewportSize({ width: 768, height: 900 });
			await gotoHydrated(page, form.path);
			await expect(page.getByText(form.panel)).toBeVisible();
			expect(await sideways(page)).toBeLessThanOrEqual(0);
		});

		test('shows its phone layout, without the side panel, at 767 px', async ({ page }) => {
			await page.setViewportSize({ width: 767, height: 900 });
			await gotoHydrated(page, form.path);
			await expect(page.getByText(form.panel)).toBeHidden();
			expect(await sideways(page)).toBeLessThanOrEqual(0);
		});
	});
}
