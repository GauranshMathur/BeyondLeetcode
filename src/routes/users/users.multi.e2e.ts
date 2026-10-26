import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from '../../lib/e2e-admin.ts';
import { gotoHydrated, reloadHydrated } from '../../lib/test/hydrated.ts';
import { LEARNER_PASSWORD, openMultiUserDatabase, type Session } from './multi-fixture.ts';

// The Users page on the Multi-user server (the "e2e-multi" project, after "setup-multi" made the admin).
// Learners are made through multi-fixture.ts, because sign-up and invites have no screens yet.

const LIN = { name: 'Lin Learner', email: 'lin.users@example.com' };
const SAM = { name: 'Sam Sneaky', email: 'sam.users@example.com' };
// A name is whatever the person typed when they signed up, and the admin reads it.
const MARKUP = {
	name: '<b id="users-xss">Mal</b><img src=x onerror="window.usersXss=1">',
	email: 'mal.users@example.com'
};

let fixture: Awaited<ReturnType<typeof openMultiUserDatabase>>;
let admin: Session;
let lin: Session;
let sam: Session;

const RESET_ENHANCED = { name: 'Rae Reset', email: 'rae.users@example.com' };
const RESET_PLAIN = { name: 'Pat Plain', email: 'pat.users@example.com' };
const REMOVE_ENHANCED = { name: 'Rhea Remove', email: 'rhea.users@example.com' };
const REMOVE_PLAIN = { name: 'Rob Removed', email: 'rob.users@example.com' };
const REMOVE_CANCEL = { name: 'Cy Cancel', email: 'cy.users@example.com' };

test.beforeAll(async () => {
	fixture = await openMultiUserDatabase();
	await fixture.ensureLearner(LIN);
	await fixture.ensureLearner(SAM);
	await fixture.ensureLearner(MARKUP);
	await fixture.ensureLearner(RESET_ENHANCED);
	await fixture.ensureLearner(RESET_PLAIN);
	await fixture.ensureLearner(REMOVE_ENHANCED);
	await fixture.ensureLearner(REMOVE_PLAIN);
	await fixture.ensureLearner(REMOVE_CANCEL);
	// Sam's stored role only contains admin: the plugin would call that an admin, the app does not.
	await fixture.db.user.update({ where: { email: SAM.email }, data: { role: 'admin,learner' } });
	admin = await fixture.signIn(E2E_ADMIN.email, E2E_ADMIN.password);
	lin = await fixture.signIn(LIN.email, LEARNER_PASSWORD);
	sam = await fixture.signIn(SAM.email, LEARNER_PASSWORD);
});

test.afterAll(async () => {
	await fixture.close();
});

test('the admin finds Users in the nav and sees every Account on it', async ({ context, page }) => {
	await context.addCookies(admin.cookies);
	await gotoHydrated(page, '/');
	const nav = page.getByRole('navigation', { name: 'Primary' });
	await expect(nav.getByRole('link')).toHaveText(['Map', 'Users', E2E_ADMIN.name]);
	await expect(nav.getByRole('link', { name: 'Users' })).not.toHaveAttribute('aria-current', /.*/);

	await nav.getByRole('link', { name: 'Users' }).click();

	await expect(page).toHaveURL('/users');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Users');
	await expect(nav.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
	await expect(nav.getByRole('link', { name: 'Map' })).not.toHaveAttribute('aria-current', /.*/);
	const table = page.getByRole('table', { name: 'All users' });
	await expect(table.getByRole('columnheader')).toHaveText([
		'name',
		'email',
		'role',
		'joined',
		'actions'
	]);

	// The database is the truth, and other files may add Accounts at any moment: compare what is stored
	// now with what the page shows, until the two agree.
	await expect(async () => {
		const stored = await fixture.db.user.findMany({ orderBy: { createdAt: 'asc' } });
		await reloadHydrated(page);
		const rows = table.locator('tbody tr');
		await expect(rows).toHaveCount(stored.length, { timeout: 2_000 });
		for (const [i, user] of stored.entries()) {
			const cells = rows.nth(i).getByRole('cell');
			const you = user.email === E2E_ADMIN.email;
			await expect(cells.nth(0)).toHaveText(you ? `${user.name} you` : user.name);
			await expect(cells.nth(1)).toHaveText(user.email);
			await expect(cells.nth(2)).toHaveText(user.role === 'admin' ? 'admin' : 'learner');
			await expect(cells.nth(3)).toHaveText(user.createdAt.toISOString().slice(0, 10));
			await expect(cells.nth(4)).toContainText(
				you ? 'you cannot remove yourself' : 'Reset password'
			);
			if (!you) await expect(cells.nth(4)).toContainText('Remove');
		}
	}).toPass();

	// The admin and the learners made above are among them; a row's actions are Reset password and
	// Remove, and the admin's own row has neither.
	await expect(
		table.getByRole('row', { name: new RegExp(`${E2E_ADMIN.email}.*admin`) })
	).toBeVisible();
	await expect(table.getByRole('row', { name: new RegExp(`${LIN.email}.*learner`) })).toBeVisible();
	await expect(
		table.getByRole('row', { name: new RegExp(E2E_ADMIN.email) }).getByRole('button')
	).toHaveCount(0);
	await expect(
		table.getByRole('row', { name: new RegExp(LIN.email) }).getByRole('button', {
			name: 'Reset password'
		})
	).toBeVisible();
});

/** What a reset must have done to the Account: the shown password is the only one that works, no session is left. */
async function expectReset(email: string, shown: string) {
	expect(shown).toMatch(/^[A-Za-z0-9]{20}$/);
	await expect(fixture.signIn(email, LEARNER_PASSWORD)).rejects.toThrow();
	await expect(fixture.signIn(email, shown)).resolves.toBeDefined();
	const user = await fixture.db.user.findUniqueOrThrow({ where: { email } });
	expect(user.mustChangePassword).toBe(true);
}

test('the admin resets a password: the one-time password is shown once with a copy field', async ({
	context,
	page
}) => {
	const old = await fixture.signIn(RESET_ENHANCED.email, LEARNER_PASSWORD);
	expect(old.cookies.length).toBeGreaterThan(0);
	await context.addCookies(admin.cookies);
	await gotoHydrated(page, '/users');
	const row = page.getByRole('row', { name: new RegExp(RESET_ENHANCED.email) });

	await row.getByRole('button', { name: 'Reset password' }).click();

	const field = page.getByLabel('One-time password');
	await expect(field).toBeVisible();
	await expect(page.getByText(`One-time password for ${RESET_ENHANCED.name}`)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Copy password' })).toBeVisible();
	const shown = await field.inputValue();
	await expectReset(RESET_ENHANCED.email, shown);
	expect(
		await fixture.db.session.count({ where: { user: { email: RESET_ENHANCED.email } } })
	).toBeLessThanOrEqual(1); // only the sign-in the check above made

	// "Done" hides it, and a reload cannot bring it back.
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(field).toHaveCount(0);
	await reloadHydrated(page);
	await expect(page.getByLabel('One-time password')).toHaveCount(0);
	await expect(page.locator('body')).not.toContainText(shown);
});

/** A progress row for an Account's Learner, so a removal has something to delete. */
async function giveProgress(email: string) {
	const { learnerId } = await fixture.db.user.findUniqueOrThrow({ where: { email } });
	await fixture.db.chapterRead.upsert({
		where: { learnerId_chapterId: { learnerId, chapterId: 'removal-e2e' } },
		update: {},
		create: { learnerId, chapterId: 'removal-e2e' }
	});
	return learnerId;
}

/** What a removal must have done: no Account, no sign-in, no row of its Learner; another Learner's progress stays. */
async function expectRemoved(email: string, learnerId: string, keptLearnerId: string) {
	expect(await fixture.db.user.count({ where: { email } })).toBe(0);
	await expect(fixture.signIn(email, LEARNER_PASSWORD)).rejects.toThrow();
	expect(await fixture.db.chapterRead.count({ where: { learnerId } })).toBe(0);
	expect(await fixture.db.learner.count({ where: { id: learnerId } })).toBe(0);
	expect(await fixture.db.chapterRead.count({ where: { learnerId: keptLearnerId } })).toBe(1);
}

test('the admin removes a user: the confirm opens under the row, and the Account and its progress go', async ({
	context,
	page
}) => {
	const learnerId = await giveProgress(REMOVE_ENHANCED.email);
	const keptLearnerId = await giveProgress(LIN.email);
	await fixture.signIn(REMOVE_ENHANCED.email, LEARNER_PASSWORD); // a live session
	await context.addCookies(admin.cookies);
	await gotoHydrated(page, '/users');
	const row = page.getByRole('row', { name: new RegExp(REMOVE_ENHANCED.email) });

	await row.getByRole('button', { name: 'Remove' }).click();

	const confirm = page.getByRole('group', { name: `Remove ${REMOVE_ENHANCED.name}` });
	await expect(confirm).toBeVisible();
	await expect(confirm).toContainText(`Remove ${REMOVE_ENHANCED.name}?`);
	await expect(confirm).toContainText(
		'This deletes their account, saved code and Submissions. It cannot be undone.'
	);
	// Nothing is deleted until the confirm is answered.
	expect(await fixture.db.user.count({ where: { email: REMOVE_ENHANCED.email } })).toBe(1);

	await confirm.getByRole('button', { name: 'Remove user' }).click();

	await expect(page.getByRole('row', { name: new RegExp(REMOVE_ENHANCED.email) })).toHaveCount(0);
	await expect(page.getByText('The account was removed.')).toBeVisible();
	await expect(confirm).toHaveCount(0);
	await expectRemoved(REMOVE_ENHANCED.email, learnerId, keptLearnerId);
});

test('Cancel closes the confirm and removes nothing', async ({ context, page }) => {
	await context.addCookies(admin.cookies);
	await gotoHydrated(page, '/users');
	await page
		.getByRole('row', { name: new RegExp(REMOVE_CANCEL.email) })
		.getByRole('button', { name: 'Remove' })
		.click();
	const confirm = page.getByRole('group', { name: `Remove ${REMOVE_CANCEL.name}` });
	await expect(confirm).toBeVisible();

	await confirm.getByRole('link', { name: 'Cancel' }).click();

	await expect(confirm).toHaveCount(0);
	expect(await fixture.db.user.count({ where: { email: REMOVE_CANCEL.email } })).toBe(1);
});

test('the admin has no Remove on their own row, and a hand-made address opens no confirm for it', async ({
	context,
	page
}) => {
	await context.addCookies(admin.cookies);
	const { id } = await fixture.db.user.findUniqueOrThrow({ where: { email: E2E_ADMIN.email } });

	await gotoHydrated(page, `/users?remove=${id}`);

	await expect(page.getByRole('group', { name: /^Remove / })).toHaveCount(0);
	await expect(
		page.getByRole('row', { name: new RegExp(E2E_ADMIN.email) }).getByRole('button')
	).toHaveCount(0);
});

test('Auth answers 404 over HTTP for every admin path and for change-password', async ({
	request
}) => {
	for (const path of [
		'admin/list-users',
		'admin/set-user-password',
		'admin/revoke-user-sessions',
		'admin/remove-user',
		'change-password'
	]) {
		const response = await request.post(`/api/auth/${path}`, {
			data: {},
			headers: { cookie: admin.cookies.map((c) => `${c.name}=${c.value}`).join('; ') }
		});
		expect(response.status(), path).toBe(404);
	}
});

test('the admin has no Reset password on their own row', async ({ context, page }) => {
	await context.addCookies(admin.cookies);
	await gotoHydrated(page, '/users');

	const own = page.getByRole('row', { name: new RegExp(E2E_ADMIN.email) });

	await expect(own.getByRole('button')).toHaveCount(0);
});

test('a name with markup in it is shown as text, never run', async ({ context, page }) => {
	await context.addCookies(admin.cookies);

	await gotoHydrated(page, '/users');

	await expect(page.getByRole('cell', { name: MARKUP.name })).toBeVisible();
	await expect(page.locator('#users-xss')).toHaveCount(0);
	expect(await page.evaluate(() => 'usersXss' in window)).toBe(false);
});

test('a learner gets 403 on Users, sees nothing of it, and has no Users link', async ({
	context,
	page
}) => {
	await context.addCookies(lin.cookies);
	await gotoHydrated(page, '/');
	const nav = page.getByRole('navigation', { name: 'Primary' });
	await expect(nav.getByRole('link')).toHaveText(['Map', LIN.name]);

	const response = await page.goto('/users');

	expect(response?.status()).toBe(403);
	await expect(page.locator('body')).not.toContainText(E2E_ADMIN.email);
	await expect(page.getByRole('table')).toHaveCount(0);
});

test('a user whose stored role merely contains admin is a learner here too', async ({
	context,
	page
}) => {
	await context.addCookies(sam.cookies);
	await gotoHydrated(page, '/');
	const nav = page.getByRole('navigation', { name: 'Primary' });
	await expect(nav.getByRole('link')).toHaveText(['Map', SAM.name]);

	const response = await page.goto('/users');

	expect(response?.status()).toBe(403);
	await expect(page.getByRole('table')).toHaveCount(0);
});

test('a visitor who is signed out is sent to Sign in, not shown the page', async ({ page }) => {
	await gotoHydrated(page, '/users');

	await expect(page).toHaveURL(/\/signin\?next=%2Fusers$/);
	await expect(page.getByRole('table')).toHaveCount(0);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('a plain form post creates an Invite, shows the link once and is never cached', async ({
		context,
		page
	}) => {
		await context.addCookies(admin.cookies);
		await page.goto('/users');
		const posted = page.waitForResponse(
			(r) => r.request().method() === 'POST' && r.url().includes('/users?/invite')
		);

		await page.getByRole('button', { name: 'Invite a user' }).click();

		// SvelteKit ran the action and then the load in one request: the answer is the page, not a 500.
		const response = await posted;
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toBe('no-store');
		await expect(page.getByLabel('Invite link')).toHaveValue(/\/invite\/[\w-]{43}$/);

		// Clean up, so a later file sees no stray pending Invite.
		await page.getByRole('button', { name: 'Cancel invite' }).first().click();
		await expect(page.getByLabel('Invite link')).toHaveCount(0);
	});

	test('a plain form post removes a user, and the answer is never cached', async ({
		context,
		page
	}) => {
		const learnerId = await giveProgress(REMOVE_PLAIN.email);
		const keptLearnerId = await giveProgress(LIN.email);
		await context.addCookies(admin.cookies);
		await page.goto('/users');

		// Remove is a link-style GET that opens the confirm, so it needs no script either.
		await page
			.getByRole('row', { name: new RegExp(REMOVE_PLAIN.email) })
			.getByRole('button', { name: 'Remove' })
			.click();
		const confirm = page.getByRole('group', { name: `Remove ${REMOVE_PLAIN.name}` });
		await expect(confirm).toBeVisible();
		const posted = page.waitForResponse(
			(r) => r.request().method() === 'POST' && r.url().includes('/users?/remove')
		);

		await confirm.getByRole('button', { name: 'Remove user' }).click();

		// SvelteKit ran the action and then the load in one request: the answer is the page, not a 500.
		const response = await posted;
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toBe('no-store');
		await expect(page.getByText('The account was removed.')).toBeVisible();
		await expect(page.getByRole('row', { name: new RegExp(REMOVE_PLAIN.email) })).toHaveCount(0);
		await expectRemoved(REMOVE_PLAIN.email, learnerId, keptLearnerId);
	});

	test('a plain form post resets a password, shows it once and is never cached', async ({
		context,
		page
	}) => {
		await context.addCookies(admin.cookies);
		await page.goto('/users');
		const posted = page.waitForResponse(
			(r) => r.request().method() === 'POST' && r.url().includes('/users?/reset')
		);

		await page
			.getByRole('row', { name: new RegExp(RESET_PLAIN.email) })
			.getByRole('button', { name: 'Reset password' })
			.click();

		// SvelteKit ran the action and then the load in one request: the answer is the page, not a 500.
		const response = await posted;
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toBe('no-store');
		const field = page.getByLabel('One-time password');
		await expect(field).toHaveJSProperty('readOnly', true);
		await expectReset(RESET_PLAIN.email, await field.inputValue());
	});
});
