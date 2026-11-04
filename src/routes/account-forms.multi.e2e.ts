import { type Browser, test as base, expect, type Page } from '@playwright/test';
import { gotoHydrated, submitHydrated, waitHydrated } from '../lib/test/hydrated.ts';
import { startFreshServer } from './signin/fresh-server.ts';
import { openMultiUserDatabase, type ServerTarget, type Session } from './users/multi-fixture.ts';
import { OWN_SERVER_ADMIN, startMultiUserServer } from './users/multi-server.ts';

// Sign up and Accept invite switch to their phone layout at 767.98px, the one phone query, as Sign in does.
// They run on the Multi-user server (4174), which is invite-only: Sign up shows its closed state and an
// unknown invite token shows the spent-token state, and both keep their side panel on a wide screen.

// Two servers of their own: Sign up is only a form on an Instance with open registration, and Accept invite
// needs an invite from an admin. Sign in uses the shared Multi-user server.
type Servers = { open: { url: string }; invited: ServerTarget & { url: string } };
const test = base.extend<object, { servers: Servers }>({
	servers: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures this one needs from this pattern
		async ({}, use) => {
			const open = await startFreshServer({ openRegistration: true });
			const invited = await startMultiUserServer();
			try {
				await use({ open, invited });
			} finally {
				await open.stop();
				await invited.stop();
			}
		},
		{ scope: 'worker', timeout: 120_000 }
	]
});

const sideways = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const forms = [
	{
		name: 'Sign up',
		path: '/signup',
		panel: 'What an account keeps'
	},
	{
		name: 'Accept invite',
		path: '/invite/not-a-real-token',
		panel: 'A used or expired token matches nothing, so no account is made.'
	}
];

for (const form of forms) {
	test.describe(form.name, () => {
		test('keeps the side panel and does not scroll sideways at 768 px', async ({ page }) => {
			await page.setViewportSize({ width: 768, height: 900 });
			await gotoHydrated(page, form.path);
			await expect(page.getByText(form.panel)).toBeVisible();
			expect(await sideways(page)).toBeLessThanOrEqual(0);
		});

		test('shows its phone layout, without the side panel, at 767 px', async ({ page }) => {
			await page.setViewportSize({ width: 767, height: 900 });
			await gotoHydrated(page, form.path);
			await expect(page.getByText(form.panel)).toBeHidden();
			expect(await sideways(page)).toBeLessThanOrEqual(0);
		});
	});
}

// C169 (#325, option 2): what a visitor types before the page has hydrated is still there afterwards. The
// page's `/_app/` scripts are held back until every field is typed into, then let load.

type Field = { label: string; value: string };

async function typeBeforeHydration(page: Page, path: string, fields: Field[]) {
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/_app/**', async (route) => {
		await gate;
		await route.continue();
	});
	// 'commit': the document is there, its module scripts are not.
	await page.goto(path, { waitUntil: 'commit' });
	for (const { label, value } of fields) await page.getByLabel(label, { exact: true }).fill(value);
	await expect(page.locator('html[data-hydrated]')).toHaveCount(0);
	release();
	await waitHydrated(page);
	for (const { label, value } of fields) {
		await expect(page.getByLabel(label, { exact: true }), `${label} after hydration`).toHaveValue(
			value
		);
	}
}

const PASSWORD = 'correct horse battery staple';
const TOO_SHORT = 'short';

/** Submits a form that fails and checks the values it sent are shown again, with JavaScript on and off. */
async function failedSubmitKeepsValues(
	browser: Browser,
	url: string,
	path: string,
	button: string,
	fields: Field[],
	password: string,
	message: string
) {
	for (const javaScriptEnabled of [true, false]) {
		const context = await browser.newContext({ baseURL: url, javaScriptEnabled });
		try {
			const page = await context.newPage();
			if (javaScriptEnabled) await gotoHydrated(page, path);
			else await page.goto(path);
			for (const { label, value } of fields)
				await page.getByLabel(label, { exact: true }).fill(value);
			await page.getByLabel('Password', { exact: true }).fill(password);
			const submit = page.getByRole('button', { name: button });
			if (javaScriptEnabled) await submitHydrated(submit);
			else await submit.click();
			await expect(page.getByText(message)).toBeVisible();
			for (const { label, value } of fields) {
				await expect(
					page.getByLabel(label, { exact: true }),
					`${label} after a failed submit, JavaScript ${javaScriptEnabled ? 'on' : 'off'}`
				).toHaveValue(value);
			}
		} finally {
			await context.close();
		}
	}
}

test.describe('what is typed before hydration', () => {
	const who = { name: 'Ada Lovelace', email: 'ada.typed@example.com' };

	test('Sign in keeps the email', async ({ page }) => {
		await typeBeforeHydration(page, '/signin', [{ label: 'Email', value: who.email }]);
	});

	test('Sign in shows the email again after a wrong password', async ({ browser, baseURL }) => {
		await failedSubmitKeepsValues(
			browser,
			baseURL as string,
			'/signin',
			'Sign in →',
			[{ label: 'Email', value: 'nobody.typed@example.com' }],
			PASSWORD,
			'Email or password is wrong.'
		);
	});

	test('Sign up keeps the name and the email', async ({ page, servers }) => {
		await typeBeforeHydration(page, `${servers.open.url}/signup`, [
			{ label: 'Name', value: who.name },
			{ label: 'Email', value: who.email }
		]);
	});

	test('Sign up shows the name and the email again after a refusal', async ({
		browser,
		servers
	}) => {
		await failedSubmitKeepsValues(
			browser,
			servers.open.url,
			'/signup',
			'Create account →',
			[
				{ label: 'Name', value: who.name },
				{ label: 'Email', value: who.email }
			],
			TOO_SHORT,
			'Use at least'
		);
	});

	test.describe('Accept invite', () => {
		test.describe.configure({ mode: 'serial' });
		let fixture: Awaited<ReturnType<typeof openMultiUserDatabase>>;
		let admin: Session;

		test.beforeAll(async ({ servers }) => {
			fixture = await openMultiUserDatabase(servers.invited);
			admin = await fixture.signIn(OWN_SERVER_ADMIN.email, OWN_SERVER_ADMIN.password);
		});
		test.afterAll(async () => {
			await fixture?.close();
		});

		async function newInvite(browser: Browser, url: string) {
			const context = await browser.newContext({ baseURL: url, storageState: admin });
			try {
				const page = await context.newPage();
				await gotoHydrated(page, '/users');
				await page.getByRole('button', { name: 'Invite a user' }).click();
				return new URL(await page.getByLabel('Invite link').inputValue()).pathname;
			} finally {
				await context.close();
			}
		}

		test('keeps the name and the email', async ({ browser, servers }) => {
			const path = await newInvite(browser, servers.invited.url);
			const context = await browser.newContext();
			try {
				await typeBeforeHydration(await context.newPage(), `${servers.invited.url}${path}`, [
					{ label: 'Name', value: who.name },
					{ label: 'Email', value: who.email }
				]);
			} finally {
				await context.close();
			}
		});

		test('shows the name and the email again after a refusal', async ({ browser, servers }) => {
			const path = await newInvite(browser, servers.invited.url);
			await failedSubmitKeepsValues(
				browser,
				servers.invited.url,
				path,
				'Create account →',
				[
					{ label: 'Name', value: who.name },
					{ label: 'Email', value: who.email }
				],
				TOO_SHORT,
				'Use at least'
			);
		});
	});
});
