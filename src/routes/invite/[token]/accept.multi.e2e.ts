import { test as base, expect } from '@playwright/test';
import {
	openMultiUserDatabase,
	type ServerTarget,
	type Session
} from '../../users/multi-fixture.ts';
import { OWN_SERVER_ADMIN, startMultiUserServer } from '../../users/multi-server.ts';

// The Accept invite page (C35b). On a Multi-user server of its own (fresh database, invite-only), so the
// Accounts and Invites made here are seen by no other file.

type Own = ServerTarget & { url: string };
const test = base.extend<object, { own: Own }>({
	own: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures this one needs from this pattern
		async ({}, use) => {
			const server = await startMultiUserServer();
			try {
				await use(server);
			} finally {
				await server.stop();
			}
		},
		{ scope: 'worker', timeout: 90_000 }
	]
});

const PASSWORD = 'correct horse battery staple';

test.describe.configure({ mode: 'serial' });

let fixture: Awaited<ReturnType<typeof openMultiUserDatabase>>;
let admin: Session;

test.beforeAll(async ({ own }) => {
	fixture = await openMultiUserDatabase(own);
	admin = await fixture.signIn(OWN_SERVER_ADMIN.email, OWN_SERVER_ADMIN.password);
});

test.afterAll(async () => {
	await fixture?.close();
});

/** The admin's Users page makes an Invite; returns its path (`/invite/<token>`) and id. */
async function newInvite(browser: import('@playwright/test').Browser, url: string) {
	const context = await browser.newContext({ baseURL: url, storageState: admin });
	try {
		const page = await context.newPage();
		await page.goto('/users');
		await page.getByRole('button', { name: 'Invite a user' }).click();
		const link = await page.getByLabel('Invite link').inputValue();
		return { path: new URL(link).pathname, token: link.slice(link.lastIndexOf('/') + 1) };
	} finally {
		await context.close();
	}
}

const tokenHashOf = async (token: string) => {
	const { hashToken } = await import('../../../lib/server/identity/invites.ts');
	return hashToken(token);
};

async function fillAndSubmit(
	page: import('@playwright/test').Page,
	who: { name: string; email: string; password?: string }
) {
	await page.getByLabel('Name').fill(who.name);
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Password').fill(who.password ?? PASSWORD);
	await page.getByRole('button', { name: 'Create account →' }).click();
}

test('a link creates one learner Account, signed in, and then stops working', async ({
	browser,
	own
}) => {
	const invite = await newInvite(browser, own.url);
	const context = await browser.newContext({ baseURL: own.url });
	const page = await context.newPage();

	const response = await page.goto(invite.path);
	// The URL holds the token: never cached, never sent on as a Referer.
	expect(response?.headers()['cache-control']).toBe('no-store');
	expect(response?.headers()['referrer-policy']).toBe('strict-origin');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are invited.');
	const cookie = (await context.cookies()).find((c) => c.name === 'beyondleetcode_invite');
	expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/auth' });

	await fillAndSubmit(page, { name: 'Ina Invited', email: 'ina.invited@example.com' });

	await expect(page).toHaveURL(`${own.url}/`);
	await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText('Ina Invited');
	const user = await fixture.db.user.findUniqueOrThrow({
		where: { email: 'ina.invited@example.com' }
	});
	expect(user.role).toBe('learner');
	expect(await fixture.db.user.count({ where: { email: 'ina.invited@example.com' } })).toBe(1);
	expect(
		(
			await fixture.db.invite.findUniqueOrThrow({
				where: { tokenHash: await tokenHashOf(invite.token) }
			})
		).usedAt
	).not.toBeNull();
	expect((await context.cookies()).some((c) => c.name === 'beyondleetcode_invite')).toBe(false);
	await context.close();

	// A second use of the link, from a visitor who is not signed in.
	const visitor = await browser.newContext({ baseURL: own.url });
	const second = await visitor.newPage();
	await second.goto(invite.path);
	await expect(second.getByRole('heading', { level: 1 })).toHaveText(
		'This invite link does not work.'
	);
	await expect(second.getByLabel('Password')).toHaveCount(0);
	await visitor.close();
});

test('signed out, the page shows the wordmark alone at 1440 and 390 px', async ({
	browser,
	own
}) => {
	const invite = await newInvite(browser, own.url);
	for (const width of [1440, 390]) {
		const context = await browser.newContext({
			baseURL: own.url,
			viewport: { width, height: 844 }
		});
		const page = await context.newPage();
		await page.goto(invite.path);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are invited.');
		await expect(page.getByRole('link', { name: /Beyond Leetcode|BLC/ })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Map' })).toHaveCount(0);
		await expect(page.getByRole('link', { name: /Settings/ })).toHaveCount(0);
		await context.close();
	}
});

test('an expired link and a cancelled link do not work, and no Account is made', async ({
	browser,
	own
}) => {
	const expired = await newInvite(browser, own.url);
	await fixture.db.invite.update({
		where: { tokenHash: await tokenHashOf(expired.token) },
		data: { expiresAt: new Date(Date.now() - 1000) }
	});
	const cancelled = await newInvite(browser, own.url);
	await fixture.db.invite.delete({ where: { tokenHash: await tokenHashOf(cancelled.token) } });
	const before = await fixture.db.user.count();

	for (const link of [expired, cancelled]) {
		const context = await browser.newContext({ baseURL: own.url });
		const page = await context.newPage();
		await page.goto(link.path);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'This invite link does not work.'
		);
		await context.close();
	}
	expect(await fixture.db.user.count()).toBe(before);
});

test('a link spent after its form was shown is refused on submit, with no Account', async ({
	browser,
	own
}) => {
	const invite = await newInvite(browser, own.url);
	const context = await browser.newContext({ baseURL: own.url });
	const page = await context.newPage();
	await page.goto(invite.path);
	await expect(page.getByLabel('Password')).toBeVisible();
	await fixture.db.invite.update({
		where: { tokenHash: await tokenHashOf(invite.token) },
		data: { usedAt: new Date() }
	});

	await fillAndSubmit(page, { name: 'Late Larry', email: 'late.larry@example.com' });

	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'This invite link does not work.'
	);
	expect(await fixture.db.user.count({ where: { email: 'late.larry@example.com' } })).toBe(0);
	await context.close();
});

test('a refused name keeps the form and the link, and the next try works', async ({
	browser,
	own
}) => {
	const invite = await newInvite(browser, own.url);
	const context = await browser.newContext({ baseURL: own.url });
	const page = await context.newPage();
	await page.goto(invite.path);

	await fillAndSubmit(page, { name: 'x'.repeat(101), email: 'long.name@example.com' });

	await expect(page.getByText('Use at most 100 characters.')).toBeVisible();
	await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
	await expect(page.getByLabel('Password')).toHaveValue('');

	await fillAndSubmit(page, { name: 'Short Name', email: 'long.name@example.com' });
	await expect(page).toHaveURL(`${own.url}/`);
	await context.close();
});

test('a malformed form body gets a fixed 400, not a 500', async ({ browser, own, playwright }) => {
	const invite = await newInvite(browser, own.url);
	const visitor = await playwright.request.newContext({ baseURL: own.url });

	const response = await visitor.post(`${invite.path}`, {
		headers: {
			origin: own.url,
			accept: 'text/html',
			'content-type': 'multipart/form-data; boundary=x'
		},
		data: 'not a multipart body'
	});

	expect(response.status()).toBe(400);
	expect(await response.text()).not.toContain(invite.token);
	await visitor.dispose();
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('a plain form post accepts the invite, and a refusal comes back as the page, not an error', async ({
		browser,
		own
	}) => {
		const invite = await newInvite(browser, own.url);
		const context = await browser.newContext({ baseURL: own.url, javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto(invite.path);

		const refusedPost = page.waitForResponse(
			(r) => r.request().method() === 'POST' && r.url().includes(invite.path)
		);
		await fillAndSubmit(page, {
			name: 'No Script',
			email: 'no.script@example.com',
			password: 'short'
		});
		// The action and the page load run in one request: headers set once, so SvelteKit does not throw.
		const refused = await refusedPost;
		expect(refused.status()).toBe(400);
		expect(refused.headers()['cache-control']).toBe('no-store');
		expect(refused.headers()['referrer-policy']).toBe('strict-origin');
		await expect(page.getByText('Use at least 12 characters.')).toBeVisible();

		const acceptedPost = page.waitForResponse(
			(r) => r.request().method() === 'POST' && r.url().includes(invite.path)
		);
		await fillAndSubmit(page, { name: 'No Script', email: 'no.script@example.com' });
		expect((await acceptedPost).status()).toBe(303);
		await expect(page).toHaveURL(`${own.url}/`);
		await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText('No Script');
		await context.close();
	});
});
