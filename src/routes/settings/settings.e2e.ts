import { expect, test } from '@playwright/test';

const paper = (page: import('@playwright/test').Page) =>
	page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const LIGHT = 'rgb(243, 238, 228)';
const DARK = 'rgb(23, 21, 18)';

test('the nav links Local to Settings', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'Primary' })
		.getByRole('link', { name: 'Local' })
		.click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
	await expect(page.getByRole('link', { name: 'Local' })).toHaveAttribute('aria-current', 'page');
});

test('dark wins on the next load whatever the device prefers, and follow-my-device restores it', async ({
	browser
}) => {
	const context = await browser.newContext({ colorScheme: 'light' });
	const page = await context.newPage();
	await page.goto('/settings');
	expect(await paper(page)).toBe(LIGHT);

	await page.getByLabel('Theme').selectOption('dark');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

	// Next load, another page: the server render is already dark.
	const response = await page.goto('/');
	expect(await response?.text()).toContain('data-theme="dark"');
	expect(await paper(page)).toBe(DARK);

	await page.goto('/settings');
	await page.getByLabel('Theme').selectOption('system');
	await page.goto('/');
	await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
	expect(await paper(page)).toBe(LIGHT);
	await context.close();
});

test('light wins on a dark device', async ({ browser }) => {
	const context = await browser.newContext({ colorScheme: 'dark' });
	const page = await context.newPage();
	await page.goto('/');
	expect(await paper(page)).toBe(DARK);
	await page.goto('/settings');
	await page.getByLabel('Theme').selectOption('light');
	await page.goto('/');
	expect(await paper(page)).toBe(LIGHT);
	await context.close();
});

test('the form works without JavaScript', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'light' });
	const page = await context.newPage();
	await page.goto('/settings');
	await page.getByLabel('Theme').selectOption('dark');
	await page.getByRole('button', { name: 'Save theme' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await context.close();
});
