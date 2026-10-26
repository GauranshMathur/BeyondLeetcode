import { test as base, expect, type Page } from '@playwright/test';
import { E2E_ADMIN } from '../../lib/e2e-admin.ts';
import { createDb } from '../../lib/server/db.ts';
import { gotoHydrated, submitHydrated } from '../../lib/test/hydrated.ts';
import { type FreshServer, startFreshServer } from './fresh-server.ts';

// Sign in and Sign out in the browser, on three kinds of server:
//   - the Multi-user server on 4174 (the "e2e-multi" project, after "setup-multi" made the admin): signed-out
//     redirects, the board of an invite-only Instance, the admin's nav. It has only the admin, and the
//     admin only signs in and out here.
//   - a server of this file's own, from the same build, with a fresh database whose Instance is Multi-user
//     with Registration Open (see fresh-server.ts). The Accounts the Sign in tests need are made through its
//     Sign up form, so this file never writes to the shared database: another file's setup there timed out
//     when two test processes wrote to it at once.
//   - a second own server whose Instance is not set up, to walk Setup, Sign out and Sign in as a released
//     Instance would, with no test switch.
//
// Sign in keeps a budget per address: twenty wrong passwords from this machine in ten minutes, across every
// Account, and five per Account. The own servers have budgets of their own; 4174's is spent only by the admin.

const NAV = 'Primary';
const WRONG = 'Email or password is wrong.';
const PASSWORD = 'correct horse battery staple';

const people = {
	asker: { name: 'Ana Asker', email: 'ana.signin@example.com' },
	settings: { name: 'Sol Settings', email: 'sol.signin@example.com' },
	locked: { name: 'Lou Locked', email: 'lou.signin@example.com' },
	hostile: { name: 'Hal Hostile', email: 'hal.signin@example.com' },
	typo: { name: 'Tia Typo', email: 'tia.signin@example.com' },
	phone: { name: 'Pat Phone', email: 'pat.signin@example.com' },
	forced: { name: 'Fay Forced', email: 'fay.signin@example.com' },
	forcedData: { name: 'Dee Data', email: 'dee.signin@example.com' },
	narrow: { name: 'Nia Narrow', email: 'nia.signin@example.com' }
};

// The click is not sure to wait for the answer: a test that signs in and then goes to another page waits for
// where Sign in lands first, or its page.goto can cancel the sign-in before the cookie is set (seen on CI).
async function signInWith(page: Page, email: string, password: string) {
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await submitHydrated(page.getByRole('button', { name: 'Sign in →' }));
}

/** The own server with Registration Open and one Account for each person above, made through Sign up. */
const onOpen = base.extend<object, { open: FreshServer }>({
	open: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures this one needs from this pattern
		async ({}, use) => {
			const server = await startFreshServer({ openRegistration: true });
			try {
				for (const person of Object.values(people)) {
					const response = await fetch(`${server.url}/signup`, {
						method: 'POST',
						redirect: 'manual',
						headers: { origin: server.url, accept: 'text/html' },
						body: new URLSearchParams({ ...person, password: PASSWORD })
					});
					if (response.status !== 303) {
						throw new Error(`signing up ${person.email} answered ${response.status}`);
					}
				}
				await use(server);
			} finally {
				await server.stop();
			}
		},
		{ scope: 'worker', timeout: 120_000 }
	],
	baseURL: async ({ open }, use) => {
		await use(open.url);
	}
});

onOpen.describe('a signed-out visitor, on an Instance where anyone may sign up', () => {
	onOpen(
		'lands on Sign in from any page and, once signed in, on the page they asked for',
		async ({ page }) => {
			for (const path of ['/', '/topics/stacks', '/settings', '/users', '/no/such/page']) {
				await gotoHydrated(page, path);
				await expect(page, path).toHaveURL(`/signin?next=${encodeURIComponent(path)}`);
			}

			await gotoHydrated(page, '/topics/stacks?x=1');
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back.');
			await signInWith(page, people.asker.email, PASSWORD);

			await expect(page).toHaveURL('/topics/stacks?x=1');
			await expect(page.getByRole('navigation', { name: NAV })).toContainText(people.asker.name);
		}
	);

	onOpen('sees the board, with a way to create an account', async ({ page }) => {
		await gotoHydrated(page, '/signin');

		await expect(page.getByRole('navigation', { name: NAV })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Beyond Leetcode' })).toBeVisible();
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Password')).toBeVisible();
		await expect(page.getByText('Forgot password? Ask your admin.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
			'href',
			'/signup'
		);
		await gotoHydrated(page, '/signup');
		await expect(page.getByRole('navigation', { name: NAV })).toHaveCount(0);
	});

	onOpen('is never sent off the site by a hostile next', async ({ page }) => {
		await gotoHydrated(page, `/signin?next=${encodeURIComponent('//evil.example/phish')}`);

		await signInWith(page, people.hostile.email, PASSWORD);

		await expect(page).toHaveURL('/');
	});

	onOpen(
		'is told one thing for a wrong password and for no such account, keeping the email but not the password',
		async ({ page, browser, open }) => {
			await gotoHydrated(page, '/signin');
			await signInWith(page, people.typo.email, 'not the password at all');

			await expect(page).toHaveURL(/\/signin$/);
			await expect(page.getByText(WRONG)).toBeVisible();
			await expect(page.getByLabel('Email')).toHaveValue(people.typo.email);
			await expect(page.getByLabel('Password')).toHaveValue('');
			await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
			await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
			// The right password then works from that very form.
			await page.getByLabel('Password').fill(PASSWORD);
			await submitHydrated(page.getByRole('button', { name: 'Sign in →' }));
			await expect(page).toHaveURL('/');

			// No Account at all: the same words, the same fields marked.
			const stranger = await browser.newContext({ baseURL: open.url });
			const other = await stranger.newPage();
			await gotoHydrated(other, '/signin');
			await signInWith(other, 'nobody.signin@example.com', 'whatever whatever');
			await expect(other.getByText(WRONG)).toBeVisible();
			await expect(other.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
			await stranger.close();
		}
	);

	onOpen(
		'is refused on the sixth wrong password, with the same message, even with the right one',
		async ({ page }) => {
			await gotoHydrated(page, '/signin');
			for (let attempt = 1; attempt <= 5; attempt++) {
				await signInWith(page, people.locked.email, `wrong password number ${attempt}`);
				await expect(page.getByText(WRONG), `wrong password ${attempt}`).toBeVisible();
			}

			// The sixth is the right password, and it is still refused, in the same words.
			await signInWith(page, people.locked.email, PASSWORD);

			await expect(page.getByText(WRONG)).toBeVisible();
			await expect(page).toHaveURL(/\/signin$/);
			await expect(page.getByRole('navigation', { name: NAV })).toHaveCount(0);
		}
	);

	onOpen(
		'is refused on the sixth wrong try for an email with no Account too, in the same words',
		async ({ page }) => {
			await gotoHydrated(page, '/signin');
			for (let attempt = 1; attempt <= 6; attempt++) {
				await signInWith(page, 'nobody.six@example.com', `wrong password number ${attempt}`);
				await expect(page.getByText(WRONG), `try ${attempt}`).toBeVisible();
			}
			await expect(page).toHaveURL(/\/signin$/);
		}
	);
});

/** True when the page is wider than the window: the sideways scroll the phone layout must not have. */
const scrollsSideways = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

onOpen.describe('Sign in on a phone (390 x 844)', () => {
	onOpen.use({ viewport: { width: 390, height: 844 } });

	onOpen(
		'is one column of 48 px fields and full-width buttons, without the figure or sideways scroll',
		async ({ page }) => {
			await gotoHydrated(page, '/signin');

			await expect(page.getByRole('img', { name: /session token/ })).toBeHidden();
			const form = page.locator('form');
			const formBox = await form.boundingBox();
			for (const control of [
				page.getByLabel('Email'),
				page.getByLabel('Password'),
				page.getByRole('button', { name: 'Sign in →' })
			]) {
				const box = await control.boundingBox();
				expect(box?.height).toBe(48);
				expect(box?.width).toBe(formBox?.width);
			}
			// The forgot-password line is under the button, the sign-up link under both.
			const button = await page.getByRole('button', { name: 'Sign in →' }).boundingBox();
			const forgot = await page.getByText('Forgot password? Ask your admin.').boundingBox();
			const signup = await page.getByRole('link', { name: 'Create an account' }).boundingBox();
			expect(forgot?.y).toBeGreaterThanOrEqual((button?.y ?? 0) + (button?.height ?? 0));
			expect(signup?.y).toBeGreaterThan(forgot?.y ?? 0);
			expect(await scrollsSideways(page)).toBe(false);
		}
	);

	onOpen('switches to the phone layout below 768 px, as the other pages do', async ({ page }) => {
		// Whether the side panel is laid out at all, not whether it has room to show at 768.
		const display = () =>
			page.locator('aside').evaluate((aside) => getComputedStyle(aside).display);
		await page.setViewportSize({ width: 767, height: 844 });
		await gotoHydrated(page, '/signin');
		expect(await display()).toBe('none');
		await page.setViewportSize({ width: 768, height: 844 });
		expect(await display()).not.toBe('none');
	});

	onOpen(
		'signs in, and shows a wrong password under the password field, with no sideways scroll',
		async ({ page }) => {
			await gotoHydrated(page, '/signin');
			await signInWith(page, people.narrow.email, 'not the password at all');

			const message = page.getByText(WRONG);
			await expect(message).toBeVisible();
			const password = await page.getByLabel('Password').boundingBox();
			const shown = await message.boundingBox();
			const button = await page.getByRole('button', { name: 'Sign in →' }).boundingBox();
			expect(shown?.y).toBeGreaterThanOrEqual((password?.y ?? 0) + (password?.height ?? 0));
			expect(shown?.y).toBeLessThan(button?.y ?? 0);
			expect(await scrollsSideways(page)).toBe(false);

			await signInWith(page, people.narrow.email, PASSWORD);
			await expect(page).toHaveURL('/');
		}
	);
});

base.describe('Sign in on a phone, on an Instance with GitHub and Google', () => {
	base.use({ viewport: { width: 390, height: 844 } });

	base('stacks a full-width button per provider, with no sideways scroll', async ({ browser }) => {
		base.setTimeout(120_000);
		// The fresh server inherits this process's environment; the variables are set only while it starts.
		const names = [
			'GITHUB_CLIENT_ID',
			'GITHUB_CLIENT_SECRET',
			'GOOGLE_CLIENT_ID',
			'GOOGLE_CLIENT_SECRET'
		];
		for (const name of names) process.env[name] = `e2e-only-${name.toLowerCase()}`;
		let server: FreshServer;
		try {
			server = await startFreshServer({ openRegistration: true });
		} finally {
			for (const name of names) delete process.env[name];
		}
		try {
			const context = await browser.newContext({ baseURL: server.url });
			const page = await context.newPage();
			await gotoHydrated(page, '/signin');

			const form = await page.locator('form').boundingBox();
			for (const name of ['Continue with GitHub', 'Continue with Google']) {
				const box = await page.getByRole('button', { name }).boundingBox();
				expect(box?.height, name).toBe(48);
				expect(box?.width, name).toBe(form?.width);
			}
			expect(await scrollsSideways(page)).toBe(false);
			await context.close();
		} finally {
			await server.stop();
		}
	});
});

onOpen.describe('a user who must change their password', () => {
	// C36a sets the flag and C36b adds /account/password; until then the 404 page is where they are sent.
	// The flag is set on the own server's database, between two requests, as an admin's reset would.
	onOpen(
		'is held to that page: no page, no load data, and no Settings data through the sign-out exception',
		async ({ page, open }) => {
			await gotoHydrated(page, '/signin');
			await signInWith(page, people.forced.email, PASSWORD);
			await expect(page).toHaveURL('/');
			const db = createDb(open.databaseUrl);
			try {
				await db.user.update({
					where: { email: people.forced.email },
					data: { mustChangePassword: true }
				});
			} finally {
				await db.$disconnect();
			}
			const headers = { origin: open.url, accept: 'text/html' };

			// A page and its load data are both sent to /account/password.
			await gotoHydrated(page, '/settings');
			await expect(page).toHaveURL('/account/password');
			const data = await page.request.get('/settings/__data.json');
			expect(await data.json()).toMatchObject({ type: 'redirect', location: '/account/password' });

			// The sign-out action is the way out ...
			const out = await page.request.post('/settings?/signout', {
				headers,
				form: {},
				maxRedirects: 0
			});
			expect(out.status()).toBe(303);
			expect(out.headers().location).toBe('/signin');
		}
	);

	onOpen(
		'cannot read the Settings load data by posting to the data URL with the sign-out action',
		async ({ page, open }) => {
			await gotoHydrated(page, '/signin');
			await signInWith(page, people.forcedData.email, PASSWORD);
			await expect(page).toHaveURL('/');
			const db = createDb(open.databaseUrl);
			try {
				await db.user.update({
					where: { email: people.forcedData.email },
					data: { mustChangePassword: true }
				});
			} finally {
				await db.$disconnect();
			}

			const response = await page.request.post('/settings/__data.json?/signout', {
				headers: { origin: open.url },
				form: {},
				maxRedirects: 0
			});

			// SvelteKit answers a data request's redirect as JSON; the load data is never run.
			const body = await response.text();
			expect(JSON.parse(body)).toMatchObject({ type: 'redirect', location: '/account/password' });
			expect(body).not.toContain('"type":"data"');
			expect(body).not.toContain(people.forcedData.name);
			expect(body).not.toContain('multiUser');
		}
	);
});

onOpen.describe('a signed-in user', () => {
	onOpen(
		'signs out from the nav and is back at Sign in, with the old page no longer theirs',
		async ({ page }) => {
			await gotoHydrated(page, '/signin');
			await signInWith(page, people.asker.email, PASSWORD);
			const nav = page.getByRole('navigation', { name: NAV });
			await expect(nav.getByRole('link')).toHaveText(['Map', people.asker.name]);
			await expect(nav.getByRole('button')).toHaveText(['Sign out']);

			await submitHydrated(nav.getByRole('button', { name: 'Sign out' }));

			await expect(page).toHaveURL('/signin');
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back.');
			await gotoHydrated(page, '/topics/stacks');
			await expect(page).toHaveURL('/signin?next=%2Ftopics%2Fstacks');
			expect((await page.context().cookies()).map((c) => c.name)).not.toContain(
				'better-auth.session_token'
			);
		}
	);

	onOpen(
		'signs out from Settings too, and Sign out is not a link: a plain GET changes nothing',
		async ({ page }) => {
			await gotoHydrated(page, '/signin');
			await signInWith(page, people.settings.email, PASSWORD);
			await expect(page).toHaveURL('/');
			await gotoHydrated(page, '/settings');
			await expect(page.getByRole('heading', { name: 'Session' })).toBeVisible();

			// A GET to the action's URL is just the Settings page, and still signed in.
			await gotoHydrated(page, '/settings?/signout');
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
			await expect(page.getByRole('navigation', { name: NAV })).toContainText(people.settings.name);

			await submitHydrated(page.getByRole('main').getByRole('button', { name: 'Sign out' }));

			await expect(page).toHaveURL('/signin');
			await gotoHydrated(page, '/settings');
			await expect(page).toHaveURL('/signin?next=%2Fsettings');
		}
	);

	onOpen('sees the 404 page for a path with no route, signed in', async ({ page }) => {
		await gotoHydrated(page, '/signin');
		await signInWith(page, people.asker.email, PASSWORD);
		await expect(page).toHaveURL('/');

		const response = await page.goto('/no/such/page');

		expect(response?.status()).toBe(404);
		await expect(page).toHaveURL('/no/such/page');
	});

	onOpen('has Sign out only on Settings on a phone', async ({ page }) => {
		await gotoHydrated(page, '/signin');
		await signInWith(page, people.phone.email, PASSWORD);
		await expect(page).toHaveURL('/');
		await page.setViewportSize({ width: 390, height: 844 });

		await gotoHydrated(page, '/');
		await expect(page.getByRole('navigation', { name: NAV })).toContainText(people.phone.name);
		await expect(
			page.getByRole('navigation', { name: NAV }).getByRole('button', { name: 'Sign out' })
		).toBeHidden();

		await gotoHydrated(page, '/settings');
		await submitHydrated(page.getByRole('main').getByRole('button', { name: 'Sign out' }));
		await expect(page).toHaveURL('/signin');
	});

	onOpen('is sent from Sign in to where they were going, not shown the form', async ({ page }) => {
		await gotoHydrated(page, '/signin');
		await signInWith(page, people.asker.email, PASSWORD);
		await expect(page).toHaveURL('/');

		await gotoHydrated(page, `/signin?next=${encodeURIComponent('/topics/stacks')}`);

		await expect(page).toHaveURL('/topics/stacks');
	});
});

// The Multi-user server on 4174: invite-only, with the admin the "setup-multi" project made.
base.describe('the shared Multi-user server', () => {
	base(
		'sends a signed-out visitor from any page, even an unknown one, to Sign in',
		async ({ page }) => {
			for (const path of ['/', '/topics/stacks', '/settings', '/users', '/no/such/page']) {
				await gotoHydrated(page, path);
				await expect(page, path).toHaveURL(`/signin?next=${encodeURIComponent(path)}`);
			}
		}
	);

	base(
		'shows the board with no sign-up link while registration is invite-only',
		async ({ page }) => {
			await gotoHydrated(page, '/signin');

			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back.');
			await expect(page.getByRole('navigation', { name: NAV })).toHaveCount(0);
			await expect(page.getByRole('link', { name: 'Create an account' })).toHaveCount(0);
		}
	);

	base('shows no provider button when no provider is configured', async ({ page }) => {
		await gotoHydrated(page, '/signin');

		await expect(page.getByRole('button', { name: /^Continue with/ })).toHaveCount(0);
	});

	base(
		'tells a visitor sent back by a provider that accounts are by invite, in fixed words',
		async ({ page }) => {
			await gotoHydrated(
				page,
				'/signin?error=SIGN_UP_CLOSED&error_description=%3Cscript%3Ewindow.pwned%3D1%3C%2Fscript%3E'
			);

			await expect(page.getByRole('alert')).toContainText('accounts are made by invite');
			await expect(page.locator('body')).not.toContainText('pwned');
			expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
		}
	);

	base('does not serve the provider sign-in start over HTTP', async ({ request }) => {
		const response = await request.post('/api/auth/sign-in/social', {
			headers: { origin: 'http://localhost:4174' },
			data: { provider: 'github', callbackURL: '/' }
		});

		expect(response.status()).toBe(404);
	});

	base('does not serve password sign-in over HTTP, only through the form', async ({ request }) => {
		const response = await request.post('/api/auth/sign-in/email', {
			headers: { origin: 'http://localhost:4174' },
			data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password }
		});

		expect(response.status()).toBe(404);
		expect(response.headers()['set-cookie']).toBeUndefined();
	});

	base(
		'gives the admin Users, their name and Sign out in the nav, in that order',
		async ({ page }) => {
			await gotoHydrated(page, '/signin');
			await signInWith(page, E2E_ADMIN.email, E2E_ADMIN.password);

			const nav = page.getByRole('navigation', { name: NAV });
			await expect(nav.getByRole('link')).toHaveText(['Map', 'Users', E2E_ADMIN.name]);
			await expect(nav.getByRole('button')).toHaveText(['Sign out']);
			await submitHydrated(nav.getByRole('button', { name: 'Sign out' }));
			await expect(page).toHaveURL('/signin');
		}
	);
});

base.describe('a fresh Instance started like a released one, with no test switch', () => {
	// Its own server, from the same build, on a fresh database: Setup offers Multi-user because the operator
	// gave it a secret and an origin, and nothing else is needed.
	base(
		'lets the first visitor choose Multi-user, create the admin, sign out and sign back in',
		async ({ browser }) => {
			base.setTimeout(120_000);
			const server = await startFreshServer();
			try {
				const context = await browser.newContext({ baseURL: server.url });
				const page = await context.newPage();

				await gotoHydrated(page, '/');
				await expect(page).toHaveURL('/setup');
				await expect(page.getByLabel('Multi-user')).toBeEnabled();
				await expect(page.getByText(/next update/)).toHaveCount(0);
				await page.getByLabel('Multi-user').check();
				await submitHydrated(page.getByRole('button', { name: 'Continue →' }));
				await page.getByLabel('Name').fill('Fresh Admin');
				await page.getByLabel('Email').fill('fresh.admin@example.com');
				await page.getByLabel('Password').fill('a long enough password');
				await submitHydrated(page.getByRole('button', { name: 'Create admin account →' }));
				await expect(page).toHaveURL('/');
				const nav = page.getByRole('navigation', { name: NAV });
				await expect(nav).toContainText('Fresh Admin');

				await submitHydrated(nav.getByRole('button', { name: 'Sign out' }));
				await expect(page).toHaveURL('/signin');
				await gotoHydrated(page, '/topics/stacks');
				await expect(page).toHaveURL('/signin?next=%2Ftopics%2Fstacks');

				await signInWith(page, 'fresh.admin@example.com', 'a long enough password');

				await expect(page).toHaveURL('/topics/stacks');
				await expect(page.getByRole('navigation', { name: NAV })).toContainText('Fresh Admin');
				await context.close();
			} finally {
				await server.stop();
			}
		}
	);
});

// C51: tagged @mobile, so the "mobile" project also runs it at 390 x 844 (see playwright.config.ts). It uses the
// Multi-user server on 4174 and its admin, like the tests above; the project depends on "setup-multi" for that.
base.describe('signing in on a phone, as a flow', () => {
	base.use({ baseURL: 'http://localhost:4174', viewport: { width: 390, height: 844 } });

	base(
		'the admin signs in, is taken to the page they asked for, and signs out',
		{ tag: '@mobile' },
		async ({ page }) => {
			await gotoHydrated(page, '/topics/stacks');
			await expect(page).toHaveURL('/signin?next=%2Ftopics%2Fstacks');

			await page.getByLabel('Email').fill(E2E_ADMIN.email);
			await page.getByLabel('Password').fill(E2E_ADMIN.password);
			await submitHydrated(page.getByRole('button', { name: 'Sign in →' }), 'tap');
			await expect(page).toHaveURL('/topics/stacks');

			// Sign out is on Settings only, on a phone.
			await gotoHydrated(page, '/settings');
			await submitHydrated(page.getByRole('main').getByRole('button', { name: 'Sign out' }), 'tap');
			await expect(page).toHaveURL('/signin');
		}
	);
});
