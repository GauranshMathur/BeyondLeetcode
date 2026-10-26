import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from '../../lib/e2e-admin.ts';
import { gotoHydrated, submitHydrated } from '../../lib/test/hydrated.ts';

test.describe.configure({ mode: 'serial' });

// The "convert" project, on its own server (4175): a Local Instance, with Multi-user available, is switched
// to Multi-user from Settings. The Local Learner has read a Chapter; the new admin's Map still shows it.

test('a Local Learner with a read Chapter switches to Multi-user and the admin keeps that Chapter', async ({
	page
}) => {
	// Local through the real screen.
	await gotoHydrated(page, '/setup');
	await submitHydrated(page.getByRole('button', { name: 'Start in Local mode →' }));
	await expect(page).toHaveURL('/');

	// Read a Chapter as the Local Learner.
	await gotoHydrated(page, '/chapters/stacks-undo-log');
	await page.locator('main').evaluate((el) => el.lastElementChild?.scrollIntoView());
	await expect(page.locator('aside').getByText('read', { exact: true })).toBeVisible();

	// Settings says plainly what this does, and opens the admin form.
	await gotoHydrated(page, '/settings');
	await expect(page.getByRole('heading', { level: 2, name: 'Multi-user' })).toBeVisible();
	await expect(page.getByText(/anyone who can open this instance/i)).toBeVisible();
	await expect(page.getByText('reset-admin-password')).toBeVisible();
	await page.getByRole('link', { name: 'Switch to Multi-user →' }).click();
	await expect(page).toHaveURL('/setup?convert');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create the admin.');

	// A refusal keeps what was typed.
	await page.getByLabel('Name').fill(E2E_ADMIN.name);
	await page.getByLabel('Email').fill(E2E_ADMIN.email);
	await page.getByLabel('Password').fill('short');
	await submitHydrated(page.getByRole('button', { name: 'Create admin account →' }));
	await expect(page.getByText('Use 12 to 128 characters.')).toBeVisible();
	await expect(page.getByLabel('Name')).toHaveValue(E2E_ADMIN.name);

	await page.getByLabel('Password').fill(E2E_ADMIN.password);
	await submitHydrated(page.getByRole('button', { name: 'Create admin account →' }));

	// Signed in as the admin, on the Map.
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText(E2E_ADMIN.name);

	// The Chapter is still read.
	await gotoHydrated(page, '/topics/stacks');
	const chapterRow = page.locator('section.chapter', {
		has: page.getByRole('link', { name: 'An undo log' })
	});
	await expect(chapterRow).toContainText('read');
	await expect(chapterRow).not.toContainText('not read');

	// One-way: Setup is gone, and the Settings row with it.
	await gotoHydrated(page, '/setup?convert');
	await expect(page).toHaveURL('/');
	await gotoHydrated(page, '/settings');
	await expect(page.getByRole('link', { name: 'Switch to Multi-user →' })).toHaveCount(0);
});

test('Sign in is now required: a signed-out visitor is sent to it', async ({ browser }) => {
	const context = await browser.newContext({ baseURL: 'http://localhost:4175' });
	const page = await context.newPage();
	await gotoHydrated(page, '/');
	await expect(page).toHaveURL(/\/signin/);
	await context.close();
});
