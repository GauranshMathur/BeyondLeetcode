import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from '../../lib/e2e-admin.ts';
import { gotoHydrated, reloadHydrated, submitHydrated } from '../../lib/test/hydrated.ts';

test.describe.configure({ mode: 'serial' });

// The "setup-multi" project: it runs first on the Multi-user server (its own fresh database, with the test
// switch on) and chooses Multi-user through the real screens. Other *.multi.e2e.ts files depend on it.

test('a fresh Instance shows Setup everywhere; Multi-user needs the admin form, then lands on the Map', async ({
	page
}) => {
	for (const path of [
		'/',
		'/topics/stacks',
		'/settings',
		'/api/auth/get-session',
		'/no/such/page'
	]) {
		await gotoHydrated(page, path);
		await expect(page, path).toHaveURL('/setup');
	}

	// Step 1: Multi-user is selectable on this server; Local is the default.
	await expect(page.getByLabel('Local')).toBeChecked();
	await expect(page.getByLabel('Multi-user')).toBeEnabled();
	await expect(page.getByRole('button', { name: 'Start in Local mode →' })).toBeVisible();
	await page.getByLabel('Multi-user').check();
	await expect(page.getByRole('button', { name: 'Continue →' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Start in Local mode →' })).toBeHidden();
	await submitHydrated(page.getByRole('button', { name: 'Continue →' }));

	// Step 2: nothing is set up yet.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create the admin.');
	await gotoHydrated(page, '/setup');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up this instance.');
	await page.getByLabel('Multi-user').check();
	await submitHydrated(page.getByRole('button', { name: 'Continue →' }));

	// A short password is refused on the form, keeping what was typed.
	await page.getByLabel('Name').fill(E2E_ADMIN.name);
	await page.getByLabel('Email').fill(E2E_ADMIN.email);
	await page.getByLabel('Password').fill('short');
	await submitHydrated(page.getByRole('button', { name: 'Create admin account →' }));
	await expect(page.getByText('Use 12 to 128 characters.')).toBeVisible();
	await expect(page.getByLabel('Name')).toHaveValue(E2E_ADMIN.name);
	await expect(page.getByLabel('Email')).toHaveValue(E2E_ADMIN.email);
	await expect(page.getByLabel('Password')).toHaveValue('');
	await expect(page).toHaveURL(/\/setup/);

	await page.getByLabel('Password').fill(E2E_ADMIN.password);
	await submitHydrated(page.getByRole('button', { name: 'Create admin account →' }));

	// Signed in as the admin: the Map, with their name in the nav.
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Every topic, in the order it builds.'
	);
	await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText(E2E_ADMIN.name);

	// Set up for good: Setup is gone, and the session survives a reload.
	await gotoHydrated(page, '/setup');
	await expect(page).toHaveURL('/');
	await reloadHydrated(page);
	await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText(E2E_ADMIN.name);

	// Sign out from the nav: back to Sign in, and the Map is out of reach until signing in again.
	await submitHydrated(
		page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Sign out' })
	);
	await expect(page).toHaveURL('/signin');
	await gotoHydrated(page, '/');
	await expect(page).toHaveURL('/signin?next=%2F');
	await page.getByLabel('Email').fill(E2E_ADMIN.email);
	await page.getByLabel('Password').fill(E2E_ADMIN.password);
	await submitHydrated(page.getByRole('button', { name: 'Sign in →' }));
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText(E2E_ADMIN.name);
});

test('once set up, a visitor without the admin session is sent to Sign in, test cookie or not', async ({
	browser
}) => {
	// A fresh context: no admin session. The test Learner cookie is honoured only in Local Mode.
	const context = await browser.newContext({ baseURL: 'http://localhost:4174' });
	await context.addCookies([
		{ name: 'test_learner', value: 'someone-else', url: 'http://localhost:4174' }
	]);
	const page = await context.newPage();

	await gotoHydrated(page, '/topics/stacks');

	await expect(page).toHaveURL(/\/signin\?next=%2Ftopics%2Fstacks$/);
	await context.close();
});

test('Better Auth answers over HTTP on this server, but not to a password sign-in, and nothing can be framed', async ({
	request
}) => {
	const headers = { origin: 'http://localhost:4174' };

	// Signing in with a password is the Sign in form's alone (it carries the per-Account limits).
	const signIn = await request.post('/api/auth/sign-in/email', {
		headers,
		data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password }
	});
	expect(signIn.status()).toBe(404);
	expect(signIn.headers()['set-cookie']).toBeUndefined();

	// The rest of its API is served, and every answer refuses framing. No session, so no one is signed in.
	const session = await request.get('/api/auth/get-session', { headers });
	expect(session.status()).toBe(200);
	expect(await session.json()).toBeNull();
	expect(session.headers()['x-frame-options']).toBe('DENY');
	expect(session.headers()['content-security-policy']).toBe("frame-ancestors 'none'");

	// And without a session the Map answers with a redirect to Sign in, never a page.
	const map = await request.get('/', { maxRedirects: 0 });
	expect(map.status()).toBe(303);
	expect(map.headers().location).toBe('/signin?next=%2F');
});
