import { expect, test } from '@playwright/test';

// The "setup" project: it runs first, on the fresh database the web server starts with, and chooses
// Local through the real screen. Every other e2e file depends on it, so they all start on a Local Instance.

test('a fresh Instance shows Setup everywhere; choosing Local opens the Map', async ({ page }) => {
	for (const path of [
		'/',
		'/topics/stacks',
		'/problems/heaps-insert',
		'/chapters/heaps-timer-queue',
		'/settings',
		'/no/such/page'
	]) {
		await page.goto(path);
		await expect(page, path).toHaveURL('/setup');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up this instance.');
	}

	// Local is the default. This server has the test switch but no BETTER_AUTH_SECRET: Multi-user is
	// off and says what to add to .env (the Multi-user server, 4174, has it: setup.multi.e2e.ts).
	await expect(page.getByLabel('Local')).toBeChecked();
	await expect(page.getByLabel('Multi-user')).toBeDisabled();
	await expect(page.getByText(/Add BETTER_AUTH_SECRET=.*to your \.env/)).toBeVisible();

	await page.getByRole('button', { name: 'Start in Local mode →' }).click();
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Every topic, in the order it builds.'
	);

	// Set up for good: Setup is gone.
	await page.goto('/setup');
	await expect(page).toHaveURL('/');
});
