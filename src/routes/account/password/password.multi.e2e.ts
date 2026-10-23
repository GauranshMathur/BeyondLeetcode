import { test as base, expect } from '@playwright/test';
import { createDb } from '../../../lib/server/db.ts';
import { type FreshServer, startFreshServer } from '../../signin/fresh-server.ts';

// Change password in the browser with JavaScript off, so the form posts and the action and the page's load
// run in one request, as for a user whose browser has no script. The server is this file's own, with
// Registration Open; the flag is set on its database between requests, as an admin's reset does.

const PASSWORD = 'correct horse battery staple';
const NEXT = 'a brand new passphrase 42';

const people = {
	forced: { name: 'Fay Forced', email: 'fay.password@example.com' },
	typo: { name: 'Tia Typo', email: 'tia.password@example.com' },
	settings: { name: 'Sol Settings', email: 'sol.password@example.com' }
};

const test = base.extend<object, { open: FreshServer }>({
	open: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures this one needs from this pattern
		async ({}, use) => {
			const server = await startFreshServer({ openRegistration: true });
			try {
				for (const person of Object.values(people)) {
					const response = await fetch(`${server.url}/signup`, {
						method: 'POST',
						redirect: 'manual',
						headers: { origin: server.url, accept: 'text/html' },
						body: new URLSearchParams({ ...person, password: PASSWORD })
					});
					if (response.status !== 303) {
						throw new Error(`signing up ${person.email} answered ${response.status}`);
					}
				}
				await use(server);
			} finally {
				await server.stop();
			}
		},
		{ scope: 'worker', timeout: 120_000 }
	],
	baseURL: async ({ open }, use) => {
		await use(open.url);
	}
});

test.use({ javaScriptEnabled: false });

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
	await page.goto('/signin');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in →' }).click();
}

async function mustChange(open: FreshServer, email: string, value: boolean) {
	const db = createDb(open.databaseUrl);
	try {
		await db.user.update({ where: { email }, data: { mustChangePassword: value } });
		return (await db.user.findUniqueOrThrow({ where: { email } })).mustChangePassword;
	} finally {
		await db.$disconnect();
	}
}

test('a user with a one-time password reaches no other page until they set a new one', async ({
	page,
	open
}) => {
	await signIn(page, people.forced.email, PASSWORD);
	await mustChange(open, people.forced.email, true);

	for (const path of ['/', '/settings', '/topics/stacks']) {
		await page.goto(path);
		await expect(page, path).toHaveURL('/account/password');
	}
	await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();

	// A short password is refused where it is typed, and nothing changes.
	await page.getByLabel('Current password').fill(PASSWORD);
	await page.getByLabel('New password', { exact: true }).fill('short');
	await page.getByLabel('Confirm new password').fill('short');
	await page.getByRole('button', { name: 'Set password and continue →' }).click();
	await expect(page.getByText('Use at least 12 characters.')).toBeVisible();
	await expect(page).toHaveURL('/account/password');

	await page.getByLabel('Current password').fill(PASSWORD);
	await page.getByLabel('New password', { exact: true }).fill(NEXT);
	await page.getByLabel('Confirm new password').fill(NEXT);
	await page.getByRole('button', { name: 'Set password and continue →' }).click();

	await expect(page).toHaveURL('/');
	await page.goto('/settings');
	await expect(page).toHaveURL('/settings');
	expect(await mustChange(open, people.forced.email, false)).toBe(false);

	// The old password is gone, the new one signs in.
	await page.context().clearCookies();
	await signIn(page, people.forced.email, PASSWORD);
	await expect(page.getByText('Email or password is wrong.')).toBeVisible();
	await signIn(page, people.forced.email, NEXT);
	await expect(page).toHaveURL('/');
});

test('a wrong current password is refused under its field', async ({ page }) => {
	await signIn(page, people.typo.email, PASSWORD);
	await page.goto('/account/password');
	await page.getByLabel('Current password').fill('not the password');
	await page.getByLabel('New password', { exact: true }).fill(NEXT);
	await page.getByLabel('Confirm new password').fill(NEXT);
	await page.getByRole('button', { name: 'Change password' }).click();
	await expect(page.getByText('That is not your current password.')).toBeVisible();
	await expect(page.getByLabel('Current password')).toHaveAttribute('aria-invalid', 'true');
});

test('any signed-in user reaches it from Settings and stays signed in after', async ({ page }) => {
	await signIn(page, people.settings.email, PASSWORD);
	await page.goto('/settings');
	await page.getByRole('link', { name: 'Change password' }).click();
	await expect(page).toHaveURL('/account/password');
	await expect(page.getByRole('heading', { name: 'Change password.' })).toBeVisible();
	await page.getByLabel('Current password').fill(PASSWORD);
	await page.getByLabel('New password', { exact: true }).fill(NEXT);
	await page.getByLabel('Confirm new password').fill(NEXT);
	await page.getByRole('button', { name: 'Change password' }).click();
	await expect(page.getByText('Password changed.')).toBeVisible();
	await page.goto('/settings');
	await expect(page).toHaveURL('/settings');
});
