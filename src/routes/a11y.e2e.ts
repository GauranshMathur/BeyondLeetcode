import { test as base, expect, type Page } from '@playwright/test';
import { asLearner } from '../lib/e2e-learner.ts';
import { phone } from '../lib/e2e-phone.ts';
import { type FreshServer, startFreshServer } from './signin/fresh-server.ts';

// One table of every Local screen (each route under src/routes with a page) in light and dark, on a desktop
// and on the phone: one main, a non-empty title and one h1. A screen that fails gets a `fixme` row with its
// reason, so the file passes and the gap stays visible. The error pages are asserted in error.e2e.ts, and the
// Multi-user screens in a11y.multi.e2e.ts. Sign in, Sign up, Users, Change password and Accept invite do not
// exist on a Local Instance (they answer 404), so they are only in the Multi-user file.
//
// This file acts as its own Learner, so it never depends on another file's leftovers.

type Screen = { name: string; path: string; fixme?: string };

const SCREENS: Screen[] = [
	{ name: 'the Map', path: '/' },
	{ name: 'a Topic', path: '/topics/stacks' },
	{ name: 'a Chapter', path: '/chapters/stacks-undo-log' },
	{ name: 'a Problem', path: '/problems/stacks-push' },
	{ name: 'Settings', path: '/settings' }
];

const test = base.extend<object, { fresh: FreshServer }>({
	fresh: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures this one needs from this pattern
		async ({}, use) => {
			const server = await startFreshServer();
			try {
				await use(server);
			} finally {
				await server.stop();
			}
		},
		{ scope: 'worker', timeout: 90_000 }
	]
});

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
			test.use({ storageState: asLearner('e2e-a11y'), ...viewport });

			for (const screen of SCREENS) {
				test(`${screen.name} has one main, a title and one h1`, async ({
					context,
					page,
					baseURL
				}) => {
					test.fixme(Boolean(screen.fixme), screen.fixme);
					await context.addCookies([{ name: 'theme', value: theme, url: baseURL as string }]);
					await page.goto(screen.path);
					await expectOneMainTitleAndH1(page, theme);
				});
			}

			// Setup only shows on an Instance that is not set up, which the shared server no longer is: a
			// server of this file's own, started the way a released Instance is.
			test('Setup has one main, a title and one h1', async ({ context, page, fresh }) => {
				await context.addCookies([{ name: 'theme', value: theme, url: fresh.url }]);
				await page.goto(`${fresh.url}/setup`);
				await expectOneMainTitleAndH1(page, theme);
			});
		});
	}
}
