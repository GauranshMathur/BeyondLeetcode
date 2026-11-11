import { type Browser, expect, type Page, test } from '@playwright/test';
import { E2E_ADMIN } from '../lib/e2e-admin.ts';
import { phone } from '../lib/e2e-phone.ts';
import { gotoHydrated } from '../lib/test/hydrated.ts';
import { LEARNER_PASSWORD, openMultiUserDatabase, type Session } from './users/multi-fixture.ts';

// One table of the Multi-user screens in light and dark, on a desktop and on the phone: one main, a title and
// one h1. A screen that fails gets a `fixme` row with its reason, so the file passes and the gap stays
// visible. It covers the routes only a Multi-user Instance has (Sign in, Sign up, Change password, Users,
// Accept invite) and the two shared ones whose header differs here (the Map and Settings). The Topic, Chapter
// and Problem screens are the same page as in Local and are in a11y.e2e.ts; Setup is there too (on this
// server it has already been walked); the error pages are asserted in error.e2e.ts.

type Who = 'nobody' | 'learner' | 'admin';
type Screen = { name: string; who: Who; path: () => string; fixme?: string };

const LEARNER = { name: 'Ari Access', email: 'ari.a11y@example.com' };

let fixture: Awaited<ReturnType<typeof openMultiUserDatabase>>;
let sessions: Record<Exclude<Who, 'nobody'>, Session>;
let invitePath = '';

// An Invite is made through the admin's Users page, as an admin would.
async function newInvitePath(browser: Browser, admin: Session) {
	const context = await browser.newContext({ storageState: admin });
	try {
		const page = await context.newPage();
		await gotoHydrated(page, '/users');
		await page.getByRole('button', { name: 'Invite a user' }).click();
		const link = await page.getByLabel('Invite link').inputValue();
		return new URL(link).pathname;
	} finally {
		await context.close();
	}
}

test.beforeAll(async ({ browser }) => {
	fixture = await openMultiUserDatabase();
	await fixture.ensureLearner(LEARNER);
	sessions = {
		learner: await fixture.signIn(LEARNER.email, LEARNER_PASSWORD),
		admin: await fixture.signIn(E2E_ADMIN.email, E2E_ADMIN.password)
	};
	invitePath = await newInvitePath(browser, sessions.admin);
});

test.afterAll(async () => {
	await fixture?.close();
});

const SCREENS: Screen[] = [
	{ name: 'Sign in', who: 'nobody', path: () => '/signin' },
	{ name: 'Sign up', who: 'nobody', path: () => '/signup' },
	{ name: 'Accept invite', who: 'nobody', path: () => invitePath },
	{ name: 'the Map', who: 'learner', path: () => '/' },
	{ name: 'Settings', who: 'learner', path: () => '/settings' },
	{ name: 'Change password', who: 'learner', path: () => '/account/password' },
	{ name: 'Users', who: 'admin', path: () => '/users' }
];

async function expectOneMainTitleAndH1(page: Page, theme: 'light' | 'dark') {
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
	expect((await page.title()).trim()).not.toBe('');
	await expect(page.getByRole('main')).toHaveCount(1);
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
}

for (const theme of ['light', 'dark'] as const) {
	for (const [size, viewport] of [
		['desktop', {}],
		['phone', phone]
	] as const) {
		test.describe(`${theme} on a ${size}`, () => {
			test.use(viewport);

			for (const screen of SCREENS) {
				test(`${screen.name} has one main, a title and one h1`, async ({
					context,
					page,
					baseURL
				}) => {
					test.fixme(Boolean(screen.fixme), screen.fixme);
					if (screen.who !== 'nobody') await context.addCookies(sessions[screen.who].cookies);
					await context.addCookies([{ name: 'theme', value: theme, url: baseURL as string }]);
					await page.goto(screen.path());
					await expectOneMainTitleAndH1(page, theme);
				});
			}
		});
	}
}
