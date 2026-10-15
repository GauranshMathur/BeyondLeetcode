import { expect, test } from '@playwright/test';

// Local Mode has no Accounts. The Local Learner is an admin, but still has no Users page: this file
// acts as that Learner (no test cookie) and only reads, so it depends on no other file's leftovers.
// The Multi-user side is users.multi.e2e.ts.

test('Local Mode has no Users: no link in the nav, and the page is not found', async ({ page }) => {
	await page.goto('/');
	const nav = page.getByRole('navigation', { name: 'Primary' });
	await expect(nav.getByRole('link')).toHaveText(['Map', 'Local']);
	await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);

	const response = await page.goto('/users');

	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'Users' })).toHaveCount(0);
});
