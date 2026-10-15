import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from '../../lib/e2e-admin.ts';

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
		await page.goto(path);
		await expect(page, path).toHaveURL('/setup');
	}

	// Step 1: Multi-user is selectable on this server; Local is the default.
	await expect(page.getByLabel('Local')).toBeChecked();
	await expect(page.getByLabel('Multi-user')).toBeEnabled();
	await expect(page.getByRole('button', { name: 'Start in Local mode →' })).toBeVisible();
	await page.getByLabel('Multi-user').check();
	await expect(page.getByRole('button', { name: 'Continue →' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Start in Local mode →' })).toBeHidden();
	await page.getByRole('button', { name: 'Continue →' }).click();

	// Step 2: nothing is set up yet.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create the admin.');
	await page.goto('/setup');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up this instance.');
	await page.getByLabel('Multi-user').check();
	await page.getByRole('button', { name: 'Continue →' }).click();

	// A short password is refused on the form, keeping what was typed.
	await page.getByLabel('Name').fill(E2E_ADMIN.name);
	await page.getByLabel('Email').fill(E2E_ADMIN.email);
	await page.getByLabel('Password').fill('short');
	await page.getByRole('button', { name: 'Create admin account →' }).click();
	await expect(page.getByText('Use 12 to 128 characters.')).toBeVisible();
	await expect(page.getByLabel('Name')).toHaveValue(E2E_ADMIN.name);
	await expect(page.getByLabel('Email')).toHaveValue(E2E_ADMIN.email);
	await expect(page.getByLabel('Password')).toHaveValue('');
	await expect(page).toHaveURL(/\/setup/);

	await page.getByLabel('Password').fill(E2E_ADMIN.password);
	await page.getByRole('button', { name: 'Create admin account →' }).click();

	// Signed in as the admin: the Map, with their name in the nav.
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Every topic, in the order it builds.'
	);
	await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText(E2E_ADMIN.name);

	// Set up for good: Setup is gone, and the session survives a reload.
	await page.goto('/setup');
	await expect(page).toHaveURL('/');
	await page.reload();
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

	await page.goto('/topics/stacks');

	await expect(page).toHaveURL(/\/signin\?next=%2Ftopics%2Fstacks$/);
	await context.close();
});

test('Better Auth answers over HTTP on this server: the right password signs in, a wrong one does not, and nothing can be framed', async ({
	request
}) => {
	const headers = { origin: 'http://localhost:4174' };
	const signIn = (password: string) =>
		request.post('/api/auth/sign-in/email', {
			headers,
			data: { email: E2E_ADMIN.email, password }
		});

	const wrong = await signIn('not the password at all');
	expect(wrong.status()).toBe(401);

	const right = await signIn(E2E_ADMIN.password);
	expect(right.status()).toBe(200);
	expect(right.headers()['set-cookie']).toContain('better-auth.session_token=');
	expect(right.headers()['x-frame-options']).toBe('DENY');
	expect(right.headers()['content-security-policy']).toBe("frame-ancestors 'none'");

	// That session is the admin: the Map answers for it.
	const map = await request.get('/', { maxRedirects: 0 });
	expect(map.status()).toBe(200);
});
