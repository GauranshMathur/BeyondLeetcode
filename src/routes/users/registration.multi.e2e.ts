import { test as base, expect, type Page, type PlaywrightWorkerArgs } from '@playwright/test';
import { gotoHydrated, reloadHydrated } from '../../lib/test/hydrated.ts';
import {
	LEARNER_PASSWORD,
	openMultiUserDatabase,
	type ServerTarget,
	type Session
} from './multi-fixture.ts';
import { OWN_SERVER_ADMIN, startMultiUserServer } from './multi-server.ts';

// The Registration section of the Users page (C34b).
//
// Every test here runs on a Multi-user server of its own (multi-server.ts): same build, fresh database,
// one running server from start to finish. Not on the shared one (4174): files run in parallel there,
// signup.multi.e2e.ts expects it to stay invite-only, and a second file writing to its SQLite database at
// the same time as users.multi.e2e.ts made that file's setup time out in CI.

const INVITE_ONLY = 'Invite only: a new account needs an invite link from you.';
const OPEN = 'Open: anyone who can reach this instance can create an account.';

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

const registration = (page: Page) => page.getByRole('combobox', { name: 'Registration' });

// Choosing only submits once the page has hydrated (the Save button goes away then), and the choice counts
// once the server has answered.
async function choose(page: Page, mode: 'Open' | 'Invite only') {
	await expect(page.getByRole('button', { name: 'Save registration' })).toHaveCount(0);
	const saved = page.waitForResponse(
		(r) => r.url().includes('?/registration') && r.request().method() === 'POST'
	);
	await registration(page).selectOption({ label: mode });
	expect((await saved).status()).toBe(200);
}

/** What a visitor who is not signed in (a signed-in one is sent to the Map) gets from /signup. */
async function signupFor(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string) {
	const visitor = await playwright.request.newContext({ baseURL });
	try {
		const html = await (await visitor.get('/signup')).text();
		if (html.includes('Sign-up is closed.')) return 'closed';
		if (html.includes('Create account')) return 'form';
		return 'something else';
	} finally {
		await visitor.dispose();
	}
}

const LIN = { name: 'Lin Registration', email: 'lin.registration@example.com' };
const SAM = { name: 'Sam Registration', email: 'sam.registration@example.com' };

test.describe('on a Multi-user server of its own', () => {
	test.describe.configure({ mode: 'serial' });

	let fixture: Awaited<ReturnType<typeof openMultiUserDatabase>>;
	let admin: Session;
	let lin: Session;
	let sam: Session;

	const storedMode = async () =>
		(await fixture.db.instance.findUniqueOrThrow({ where: { id: 'instance' } })).registrationMode;

	test.beforeAll(async ({ own }) => {
		fixture = await openMultiUserDatabase(own);
		await fixture.ensureLearner(LIN);
		await fixture.ensureLearner(SAM);
		// Sam's stored role only contains admin: the plugin would call that an admin, the app does not.
		await fixture.db.user.update({ where: { email: SAM.email }, data: { role: 'admin,learner' } });
		admin = await fixture.signIn(OWN_SERVER_ADMIN.email, OWN_SERVER_ADMIN.password);
		lin = await fixture.signIn(LIN.email, LEARNER_PASSWORD);
		sam = await fixture.signIn(SAM.email, LEARNER_PASSWORD);
	});

	test('the admin sees who can create an account, above the list of users, and a new instance is invite-only', async ({
		browser,
		own
	}) => {
		const context = await browser.newContext({ baseURL: own.url, storageState: admin });
		const page = await context.newPage();
		await gotoHydrated(page, '/users');

		const headings = page.getByRole('heading', { level: 2 });
		await expect(headings.first()).toHaveText('Registration');
		await expect(page.getByText('Who can create an account.')).toBeVisible();
		await expect(registration(page)).toHaveValue('invite');
		await expect(registration(page).getByRole('option')).toHaveText(['Invite only', 'Open']);
		await expect(page.getByText(INVITE_ONLY)).toBeVisible();
		await expect(page.getByText(OPEN)).toHaveCount(0);
		await expect(headings.nth(1)).toHaveText('Invite a user');
		await expect(headings.nth(2)).toHaveText('All users');
		await context.close();
	});

	test('a learner, a user whose stored role merely contains admin and a visitor who is signed out cannot switch it', async ({
		playwright,
		own
	}) => {
		const post = async (storageState?: Session) => {
			const request = await playwright.request.newContext({ baseURL: own.url, storageState });
			try {
				return await request.post('/users?/registration', {
					headers: { origin: own.url, accept: 'text/html' },
					form: { registration: 'open' },
					maxRedirects: 0
				});
			} finally {
				await request.dispose();
			}
		};

		const learner = await post(lin);
		const sneaky = await post(sam);
		const anonymous = await post();

		expect(learner.status()).toBe(403);
		expect(sneaky.status()).toBe(403);
		expect(anonymous.status()).toBe(303);
		expect(anonymous.headers().location).toMatch(/^\/signin\?next=/);
		expect(await storedMode()).toBe('invite');
		expect(await signupFor(playwright, own.url)).toBe('closed');
	});

	test.afterAll(async () => {
		await fixture?.close();
	});

	test('switching to Open opens /signup on the next request, and switching back closes it, with no restart', async ({
		browser,
		own
	}) => {
		const adminContext = await browser.newContext({ baseURL: own.url, storageState: admin });
		const visitorContext = await browser.newContext({ baseURL: own.url });
		const adminPage = await adminContext.newPage();
		const visitor = await visitorContext.newPage();
		const closed = async () => {
			await gotoHydrated(visitor, '/signup');
			await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('Sign-up is closed.');
			await expect(visitor.getByLabel('Password')).toHaveCount(0);
			// A form posted anyway, the way a script would, is refused too.
			const response = await visitorContext.request.post('/signup', {
				headers: { origin: own.url, accept: 'text/html' },
				form: {
					name: 'Late Comer',
					email: 'late.comer@example.com',
					password: 'a long enough secret'
				}
			});
			expect(response.status()).toBe(403);
		};

		// A new instance is invite-only.
		await closed();

		await gotoHydrated(adminPage, '/users');
		await expect(registration(adminPage)).toHaveValue('invite');
		await choose(adminPage, 'Open');
		await expect(adminPage.getByText(OPEN)).toBeVisible();
		await expect(adminPage.getByText(INVITE_ONLY)).toHaveCount(0);

		// The very next request to /signup offers the form.
		await gotoHydrated(visitor, '/signup');
		await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('Start reading.');
		await expect(visitor.getByLabel('Password')).toBeVisible();
		await expect(visitor.getByRole('button', { name: 'Create account →' })).toBeVisible();

		// The choice is the stored one: a reload shows it, and so does a fresh page.
		await reloadHydrated(adminPage);
		await expect(registration(adminPage)).toHaveValue('open');

		await choose(adminPage, 'Invite only');
		await expect(adminPage.getByText(INVITE_ONLY)).toBeVisible();

		// The next request after switching back is closed again, and an Account cannot be made.
		await closed();
		await reloadHydrated(adminPage);
		await expect(registration(adminPage)).toHaveValue('invite');
		expect(
			await fixture.db.user.findUnique({ where: { email: 'late.comer@example.com' } })
		).toBeNull();

		await adminContext.close();
		await visitorContext.close();
	});

	test('a post from another site is refused, and changes nothing', async ({ playwright, own }) => {
		const request = await playwright.request.newContext({ baseURL: own.url, storageState: admin });

		const response = await request.post('/users?/registration', {
			headers: { origin: 'http://evil.example', accept: 'text/html' },
			form: { registration: 'open' }
		});

		expect(response.status()).toBe(403);
		expect(await storedMode()).toBe('invite');
		expect(await signupFor(playwright, own.url)).toBe('closed');
		await request.dispose();
	});

	test('a value that is neither mode is refused, and changes nothing', async ({
		playwright,
		own
	}) => {
		const request = await playwright.request.newContext({ baseURL: own.url, storageState: admin });

		const response = await request.post('/users?/registration', {
			headers: { origin: own.url, accept: 'text/html' },
			form: { registration: 'everyone' }
		});

		expect(response.status()).toBe(400);
		expect(await response.text()).toContain('Choose invite only or open.');
		expect(await signupFor(playwright, own.url)).toBe('closed');
		await request.dispose();
	});

	test('it works without JavaScript: the Save button posts the choice', async ({
		browser,
		playwright,
		own
	}) => {
		const context = await browser.newContext({
			baseURL: own.url,
			storageState: admin,
			javaScriptEnabled: false
		});
		const page = await context.newPage();
		try {
			await page.goto('/users');
			await registration(page).selectOption({ label: 'Open' });
			await page.getByRole('button', { name: 'Save registration' }).click();

			await expect(registration(page)).toHaveValue('open');
			await expect(page.getByText(OPEN)).toBeVisible();
			expect(await signupFor(playwright, own.url)).toBe('form');
		} finally {
			// Back to invite-only, so nothing later depends on this test's end state, passed or failed.
			await page.goto('/users');
			await registration(page).selectOption({ label: 'Invite only' });
			await page.getByRole('button', { name: 'Save registration' }).click();
			await expect(registration(page)).toHaveValue('invite');
			await context.close();
		}
	});

	test('on a phone the section fits without scrolling sideways', async ({ browser, own }) => {
		const context = await browser.newContext({
			baseURL: own.url,
			storageState: admin,
			viewport: { width: 390, height: 844 }
		});
		const page = await context.newPage();
		await gotoHydrated(page, '/users');

		await expect(registration(page)).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
		await context.close();
	});
});
