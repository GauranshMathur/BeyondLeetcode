import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from '../lib/e2e-admin.ts';
import { gotoHydrated, submitHydrated } from '../lib/test/hydrated.ts';

// Sprint 4 exit: an admin can set up, invite a user, and that user signs in and keeps their own progress.
// Everything goes through the real forms and pages. The admin is the one "setup-multi" made through Setup;
// registration stays Invite-only (the default), so the Invite link is the only way in. Two browser contexts
// stand for two people. The shared 4174 server is enough: nothing here changes the Instance's settings.

const NAV = 'Primary';
const PERSON = {
	name: 'Ida Invited',
	email: 'ida.sprint4-exit@example.com',
	password: 'correct horse battery staple'
};

test('an admin invites a user; the user reads a Chapter, signs out and in again and keeps it; the admin does not see it', async ({
	browser
}) => {
	const adminContext = await browser.newContext({ baseURL: 'http://localhost:4174' });
	const userContext = await browser.newContext({ baseURL: 'http://localhost:4174' });
	try {
		const admin = await adminContext.newPage();
		const user = await userContext.newPage();

		// The admin signs in through the form and makes an Invite on the Users page.
		await gotoHydrated(admin, '/signin');
		await admin.getByLabel('Email').fill(E2E_ADMIN.email);
		await admin.getByLabel('Password').fill(E2E_ADMIN.password);
		await submitHydrated(admin.getByRole('button', { name: 'Sign in →' }));
		await expect(admin).toHaveURL('/');
		await admin.getByRole('navigation', { name: NAV }).getByRole('link', { name: 'Users' }).click();
		await expect(admin).toHaveURL('/users');
		await admin.getByRole('button', { name: 'Invite a user' }).click();
		// The link shows once, in a read-only field: read it as the admin would copy it.
		const field = admin.getByLabel('Invite link');
		await expect(field).toHaveValue(/\/invite\/\S+$/);
		const link = await field.inputValue();

		// A second browser opens the link and creates the Account.
		await gotoHydrated(user, link);
		await expect(user.getByRole('heading', { level: 1 })).toHaveText('You are invited.');
		await user.getByLabel('Name').fill(PERSON.name);
		await user.getByLabel('Email').fill(PERSON.email);
		await user.getByLabel('Password').fill(PERSON.password);
		await submitHydrated(user.getByRole('button', { name: 'Create account →' }));
		await expect(user.getByRole('navigation', { name: NAV })).toContainText(PERSON.name);

		// The user reads a Chapter to its end.
		await gotoHydrated(user, '/topics/stacks');
		const chapterRow = user.locator('section.chapter', {
			has: user.getByRole('link', { name: 'An undo log' })
		});
		await expect(chapterRow).toContainText('not read');
		await user.getByRole('link', { name: 'An undo log' }).click();
		await expect(user).toHaveURL('/chapters/stacks-undo-log');
		await user.locator('main').evaluate((el) => el.lastElementChild?.scrollIntoView());
		await expect(user.locator('aside').getByText('read', { exact: true })).toBeVisible();

		// Signs out, signs in again with the same form.
		await submitHydrated(
			user.getByRole('navigation', { name: NAV }).getByRole('button', { name: 'Sign out' })
		);
		await expect(user).toHaveURL('/signin');
		await user.getByLabel('Email').fill(PERSON.email);
		await user.getByLabel('Password').fill(PERSON.password);
		await submitHydrated(user.getByRole('button', { name: 'Sign in →' }));
		await expect(user).toHaveURL('/');

		// From the Map to the Topic: the Chapter is still read.
		await user.getByRole('link', { name: /^Stacks, / }).click();
		await expect(user).toHaveURL('/topics/stacks');
		await expect(chapterRow).toContainText('read');
		await expect(chapterRow).not.toContainText('not read');
		await expect(user.getByLabel('Topic progress')).toContainText('1 of 2');

		// The admin's own progress is untouched: the same Chapter is unread there.
		await gotoHydrated(admin, '/');
		await admin.getByRole('link', { name: /^Stacks, / }).click();
		await expect(admin).toHaveURL('/topics/stacks');
		const adminRow = admin.locator('section.chapter', {
			has: admin.getByRole('link', { name: 'An undo log' })
		});
		await expect(adminRow).toContainText('not read');
		await expect(admin.getByLabel('Topic progress')).toContainText('0 of 2');
	} finally {
		await adminContext.close();
		await userContext.close();
	}
});
