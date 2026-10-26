import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from '../lib/e2e-admin.ts';
import { gotoHydrated } from '../lib/test/hydrated.ts';
import { LEARNER_PASSWORD, openMultiUserDatabase, type Session } from './users/multi-fixture.ts';

// The phone header (F.10f) on the Multi-user server: 390 x 844, a learner and the admin.

test.use({ viewport: { width: 390, height: 844 } });

const LIN = { name: 'Lin Learner', email: 'lin.nav@example.com' };
const LONG = {
	name: 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley',
	email: 'long.nav@example.com'
};

let fixture: Awaited<ReturnType<typeof openMultiUserDatabase>>;
let admin: Session;
let lin: Session;
let long: Session;

test.beforeAll(async () => {
	fixture = await openMultiUserDatabase();
	await fixture.ensureLearner(LIN);
	await fixture.ensureLearner(LONG);
	admin = await fixture.signIn(E2E_ADMIN.email, E2E_ADMIN.password);
	lin = await fixture.signIn(LIN.email, LEARNER_PASSWORD);
	long = await fixture.signIn(LONG.email, LEARNER_PASSWORD);
});

test.afterAll(async () => {
	await fixture.close();
});

async function expectBarFits(page: import('@playwright/test').Page) {
	const header = page.locator('header');
	expect((await header.boundingBox())?.height).toBe(56); // the 56 px bar, rule included
	for (const link of await header.getByRole('link').all()) {
		expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
	}
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	// Sign out is not in the bar; it stays on Settings.
	await expect(header.getByRole('button', { name: 'Sign out' })).toBeHidden();
}

test('a learner sees BLC and their name, and the name is marked on Settings', async ({
	context,
	page
}) => {
	await context.addCookies(lin.cookies);
	await gotoHydrated(page, '/');
	const nav = page.getByRole('navigation', { name: 'Primary' });
	await expect(page.getByRole('link', { name: 'BLC' })).toHaveAttribute('href', '/');
	await expect(nav.getByRole('link')).toHaveText([LIN.name]);
	await expect(nav.getByRole('link', { name: LIN.name })).not.toHaveAttribute('aria-current', /.*/);
	await expectBarFits(page);

	await nav.getByRole('link', { name: LIN.name }).click();
	await expect(page).toHaveURL('/settings');
	await expect(nav.getByRole('link', { name: LIN.name })).toHaveAttribute('aria-current', 'page');
	await expectBarFits(page);
	await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('the admin sees Users and their name, each marked on its own page', async ({
	context,
	page
}) => {
	await context.addCookies(admin.cookies);
	await gotoHydrated(page, '/');
	const nav = page.getByRole('navigation', { name: 'Primary' });
	await expect(nav.getByRole('link')).toHaveText(['Users', E2E_ADMIN.name]);
	await expectBarFits(page);

	await nav.getByRole('link', { name: 'Users' }).click();
	await expect(page).toHaveURL('/users');
	await expect(nav.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
	await expect(nav.getByRole('link', { name: E2E_ADMIN.name })).not.toHaveAttribute(
		'aria-current',
		/.*/
	);
	await expectBarFits(page);

	await nav.getByRole('link', { name: E2E_ADMIN.name }).click();
	await expect(page).toHaveURL('/settings');
	await expect(nav.getByRole('link', { name: E2E_ADMIN.name })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(nav.getByRole('link', { name: 'Users' })).not.toHaveAttribute('aria-current', /.*/);
});

test('a long name is cut with an ellipsis and the bar does not widen', async ({
	context,
	page
}) => {
	await context.addCookies(long.cookies);
	await gotoHydrated(page, '/');
	await expectBarFits(page);
	const link = page.getByRole('navigation', { name: 'Primary' }).getByRole('link');
	await expect(link).toHaveText(LONG.name);
	const cut = await link.evaluate((el) => el.scrollWidth > el.clientWidth);
	expect(cut).toBe(true);
	const box = await link.boundingBox();
	expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(370);
});
