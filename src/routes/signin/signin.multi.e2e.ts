import { expect, type Page, test } from '@playwright/test';
import { E2E_ADMIN } from '../../lib/e2e-admin.ts';
import { LEARNER_PASSWORD, openMultiUserDatabase } from '../users/multi-fixture.ts';
import { startFreshServer } from './fresh-server.ts';

// Sign in and Sign out on the Multi-user server (the "e2e-multi" project, after "setup-multi" made the admin).
// Learners are made through multi-fixture.ts; each test uses its own, so the limits one test spends
// (five wrong passwords lock an Account out of one address for ten minutes) never reach another.
//
// Sign in carries a shared budget per address: twenty wrong passwords from this machine in ten minutes, across
// every Account. This file spends six in all; keep the total across files well under twenty.

const NAV = 'Primary';
const WRONG = 'Email or password is wrong.';

const people = {
	asker: { name: 'Ana Asker', email: 'ana.signin@example.com' },
	settings: { name: 'Sol Settings', email: 'sol.signin@example.com' },
	locked: { name: 'Lou Locked', email: 'lou.signin@example.com' },
	hostile: { name: 'Hal Hostile', email: 'hal.signin@example.com' },
	typo: { name: 'Tia Typo', email: 'tia.signin@example.com' },
	phone: { name: 'Pat Phone', email: 'pat.signin@example.com' }
};

let fixture: Awaited<ReturnType<typeof openMultiUserDatabase>>;

test.beforeAll(async () => {
	fixture = await openMultiUserDatabase();
	for (const person of Object.values(people)) await fixture.ensureLearner(person);
});

test.afterAll(async () => {
	await fixture.close();
});

async function signInWith(page: Page, email: string, password: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in →' }).click();
}

test.describe('a signed-out visitor', () => {
	test('lands on Sign in from any page and, once signed in, on the page they asked for', async ({
		page
	}) => {
		for (const path of ['/', '/topics/stacks', '/settings', '/users', '/no/such/page']) {
			await page.goto(path);
			await expect(page, path).toHaveURL(`/signin?next=${encodeURIComponent(path)}`);
		}

		await page.goto('/topics/stacks');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back.');
		await signInWith(page, people.asker.email, LEARNER_PASSWORD);

		await expect(page).toHaveURL('/topics/stacks');
		await expect(page.getByRole('navigation', { name: NAV })).toContainText(people.asker.name);
	});

	test('sees the board: wordmark alone in the header, no Map or name link, and no sign-up link on an invite-only Instance', async ({
		page
	}) => {
		await page.goto('/signin');

		await expect(page.getByRole('navigation', { name: NAV })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Beyond Leetcode' })).toBeVisible();
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Password')).toBeVisible();
		await expect(page.getByText('Forgot password? Ask your admin.')).toBeVisible();
		// This Instance is invite-only (every new one is), so the page does not point at a closed form.
		await expect(page.getByRole('link', { name: 'Create an account' })).toHaveCount(0);
		await page.goto('/signup');
		await expect(page.getByRole('navigation', { name: NAV })).toHaveCount(0);
	});

	test('is never sent off the site by a hostile next', async ({ page }) => {
		await page.goto(`/signin?next=${encodeURIComponent('//evil.example/phish')}`);

		await signInWith(page, people.hostile.email, LEARNER_PASSWORD);

		await expect(page).toHaveURL('/');
	});

	test('is told one thing for a wrong password and for no such account, keeping the email but not the password', async ({
		page,
		browser
	}) => {
		await page.goto('/signin');
		await signInWith(page, people.typo.email, 'not the password at all');

		await expect(page).toHaveURL(/\/signin$/);
		await expect(page.getByText(WRONG)).toBeVisible();
		await expect(page.getByLabel('Email')).toHaveValue(people.typo.email);
		await expect(page.getByLabel('Password')).toHaveValue('');
		await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
		// The right password then works from that very form.
		await page.getByLabel('Password').fill(LEARNER_PASSWORD);
		await page.getByRole('button', { name: 'Sign in →' }).click();
		await expect(page).toHaveURL('/');

		// No Account at all: the same words, the same fields marked.
		const stranger = await browser.newContext({ baseURL: 'http://localhost:4174' });
		const other = await stranger.newPage();
		await other.goto('/signin');
		await signInWith(other, 'nobody.signin@example.com', 'whatever whatever');
		await expect(other.getByText(WRONG)).toBeVisible();
		await expect(other.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
		await stranger.close();
	});

	test('is refused on the sixth wrong password, with the same message, even with the right one', async ({
		page
	}) => {
		await page.goto('/signin');
		for (let attempt = 1; attempt <= 5; attempt++) {
			await signInWith(page, people.locked.email, `wrong password number ${attempt}`);
			await expect(page.getByText(WRONG), `wrong password ${attempt}`).toBeVisible();
		}

		// The sixth is the right password, and it is still refused, in the same words.
		await signInWith(page, people.locked.email, LEARNER_PASSWORD);

		await expect(page.getByText(WRONG)).toBeVisible();
		await expect(page).toHaveURL(/\/signin$/);
		await expect(page.getByRole('navigation', { name: NAV })).toHaveCount(0);
	});

	test('cannot sign in over HTTP, only through the form', async ({ request }) => {
		const response = await request.post('/api/auth/sign-in/email', {
			headers: { origin: 'http://localhost:4174' },
			data: { email: people.asker.email, password: LEARNER_PASSWORD }
		});

		expect(response.status()).toBe(404);
		expect(response.headers()['set-cookie']).toBeUndefined();
	});
});

test.describe('a signed-in user', () => {
	test('signs out from the nav and is back at Sign in, with the old page no longer theirs', async ({
		page
	}) => {
		await page.goto('/signin');
		await signInWith(page, people.asker.email, LEARNER_PASSWORD);
		const nav = page.getByRole('navigation', { name: NAV });
		await expect(nav.getByRole('link')).toHaveText(['Map', people.asker.name]);
		await expect(nav.getByRole('button')).toHaveText(['Sign out']);

		await nav.getByRole('button', { name: 'Sign out' }).click();

		await expect(page).toHaveURL('/signin');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back.');
		await page.goto('/topics/stacks');
		await expect(page).toHaveURL('/signin?next=%2Ftopics%2Fstacks');
		expect((await page.context().cookies()).map((c) => c.name)).not.toContain(
			'better-auth.session_token'
		);
	});

	test('signs out from Settings too, and Sign out is not a link: a plain GET changes nothing', async ({
		page
	}) => {
		await page.goto('/signin');
		await signInWith(page, people.settings.email, LEARNER_PASSWORD);
		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: 'Session' })).toBeVisible();

		// A GET to the action's URL is just the Settings page, and still signed in.
		await page.goto('/settings?/signout');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
		await expect(page.getByRole('navigation', { name: NAV })).toContainText(people.settings.name);

		await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();

		await expect(page).toHaveURL('/signin');
		await page.goto('/settings');
		await expect(page).toHaveURL('/signin?next=%2Fsettings');
	});

	test('sees the 404 page for a path with no route, signed in', async ({ page }) => {
		await page.goto('/signin');
		await signInWith(page, people.asker.email, LEARNER_PASSWORD);

		const response = await page.goto('/no/such/page');

		expect(response?.status()).toBe(404);
		await expect(page).toHaveURL('/no/such/page');
	});

	test('has Sign out only on Settings on a phone', async ({ page }) => {
		await page.goto('/signin');
		await signInWith(page, people.phone.email, LEARNER_PASSWORD);
		await page.setViewportSize({ width: 390, height: 844 });

		await page.goto('/');
		await expect(page.getByRole('navigation', { name: NAV })).toContainText(people.phone.name);
		await expect(
			page.getByRole('navigation', { name: NAV }).getByRole('button', { name: 'Sign out' })
		).toBeHidden();

		await page.goto('/settings');
		await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL('/signin');
	});

	test('is sent from Sign in to where they were going, not shown the form', async ({ page }) => {
		await page.goto('/signin');
		await signInWith(page, people.asker.email, LEARNER_PASSWORD);

		await page.goto(`/signin?next=${encodeURIComponent('/topics/stacks')}`);

		await expect(page).toHaveURL('/topics/stacks');
	});
});

test('the admin has Users, their name and Sign out in the nav, in that order', async ({ page }) => {
	await page.goto('/signin');
	await signInWith(page, E2E_ADMIN.email, E2E_ADMIN.password);

	const nav = page.getByRole('navigation', { name: NAV });
	await expect(nav.getByRole('link')).toHaveText(['Map', 'Users', E2E_ADMIN.name]);
	await expect(nav.getByRole('button')).toHaveText(['Sign out']);
	await nav.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL('/signin');
});

test.describe('a fresh Instance started like a released one, with no test switch', () => {
	// Its own server, from the same build, on a fresh database: Setup offers Multi-user because the operator
	// gave it a secret and an origin, and nothing else is needed.
	test('lets the first visitor choose Multi-user, create the admin, sign out and sign back in', async ({
		browser
	}) => {
		test.setTimeout(120_000);
		const server = await startFreshServer();
		try {
			const context = await browser.newContext({ baseURL: server.url });
			const page = await context.newPage();

			await page.goto('/');
			await expect(page).toHaveURL('/setup');
			await expect(page.getByLabel('Multi-user')).toBeEnabled();
			await expect(page.getByText(/next update/)).toHaveCount(0);
			await page.getByLabel('Multi-user').check();
			await page.getByRole('button', { name: 'Continue →' }).click();
			await page.getByLabel('Name').fill('Fresh Admin');
			await page.getByLabel('Email').fill('fresh.admin@example.com');
			await page.getByLabel('Password').fill('a long enough password');
			await page.getByRole('button', { name: 'Create admin account →' }).click();
			await expect(page).toHaveURL('/');
			const nav = page.getByRole('navigation', { name: NAV });
			await expect(nav).toContainText('Fresh Admin');

			await nav.getByRole('button', { name: 'Sign out' }).click();
			await expect(page).toHaveURL('/signin');
			await page.goto('/topics/stacks');
			await expect(page).toHaveURL('/signin?next=%2Ftopics%2Fstacks');

			await signInWith(page, 'fresh.admin@example.com', 'a long enough password');

			await expect(page).toHaveURL('/topics/stacks');
			await expect(page.getByRole('navigation', { name: NAV })).toContainText('Fresh Admin');
			await context.close();
		} finally {
			await server.stop();
		}
	});
});
