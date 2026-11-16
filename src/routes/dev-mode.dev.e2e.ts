import { expect, type Page, test } from '@playwright/test';
import { asLearner } from '../lib/e2e-learner.ts';
import { phone } from '../lib/e2e-phone.ts';
import { gotoHydrated } from '../lib/test/hydrated.ts';

// Runs in the "dev" project, against a Local Instance started with the dev-mode switch (the fourth server).
// This file acts as its own Learner, so it never depends on another file's leftovers.
//
// The screens are the ones in a11y.e2e.ts's table, minus the Locked Topic error: with dev mode on no Topic is
// Locked, so that screen cannot be reached. Setup (shows only on an Instance that is not set up, where dev mode
// is off) and Sign in (Multi-user only, which refuses to start with the switch) cannot be reached either, so
// the band is not asserted there. A second error screen stands in: an unknown Problem.
test.use({ storageState: asLearner('e2e-dev-mode') });

const SCREENS = [
	{ name: 'the Map', path: '/' },
	{ name: 'a Topic', path: '/topics/stacks' },
	{ name: 'a Chapter', path: '/chapters/stacks-undo-log' },
	{ name: 'a Problem', path: '/problems/stacks-push' },
	{ name: 'Settings', path: '/settings' },
	{ name: 'the Guide', path: '/guide' },
	{ name: 'a Not Found error', path: '/no/such/page' },
	{ name: 'an unknown Problem error', path: '/problems/no-such-problem' }
];

const band = (page: Page) => page.getByRole('region', { name: 'Dev mode' });

test('a fresh Learner opens the last Topic’s last Problem, which is Locked without dev mode', async ({
	page
}) => {
	await gotoHydrated(page, '/problems/heaps-insert');
	await expect(page).toHaveURL('/problems/heaps-insert');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.getByRole('main')).toHaveCount(1);
	await expect(band(page)).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
	for (const [size, viewport] of [
		['desktop', {}],
		['phone', phone]
	] as const) {
		test.describe(`the banner in ${theme} on a ${size}`, () => {
			test.use(viewport);

			for (const screen of SCREENS) {
				test(`is on ${screen.name}`, async ({ context, page, baseURL }) => {
					await context.addCookies([{ name: 'theme', value: theme, url: baseURL as string }]);
					await page.goto(screen.path);
					await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
					await expect(band(page)).toHaveCount(1);
					await expect(band(page)).toBeVisible();
					await expect(band(page)).toContainText('Everything is unlocked.');
				});
			}
		});
	}
}

test('the banner has no tab stop, and one landmark carries its name', async ({ page }) => {
	await gotoHydrated(page, '/');
	await expect(band(page)).toHaveCount(1);
	await expect(band(page).locator('a, button, input, select, textarea, [tabindex]')).toHaveCount(0);
	// Tab from the top of the page through the first stops: none of them is inside the band.
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press('Tab');
		const inBand = await page.evaluate(
			() => document.activeElement?.closest('[aria-label="Dev mode"]') !== null
		);
		expect(inBand).toBe(false);
	}
});

for (const [name, size] of [
	['390x844', { width: 390, height: 844 }],
	['320x256', { width: 320, height: 256 }]
] as const) {
	test(`with the banner on, the Problem screen does not scroll the document and the tab bar is in view at ${name}`, async ({
		page
	}) => {
		await page.setViewportSize(size);
		await gotoHydrated(page, '/problems/stacks-push');
		await expect(band(page)).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollHeight - document.documentElement.clientHeight
		);
		expect(overflow).toBeLessThanOrEqual(0);
		const tabBar = page.getByRole('navigation', { name: 'Workspace' });
		await expect(tabBar).toBeVisible();
		const box = await tabBar.boundingBox();
		expect(box).not.toBeNull();
		const bottom = (box?.y ?? 0) + (box?.height ?? 0);
		expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
		expect(bottom).toBeLessThanOrEqual(size.height);
	});
}

for (const [name, size] of [
	['desktop', { width: 1280, height: 800 }],
	['phone', phone.viewport]
] as const) {
	test(`the banner's text lines up with the wordmark on the Map on a ${name}`, async ({ page }) => {
		await page.setViewportSize(size);
		await gotoHydrated(page, '/');
		const wordmark = await page.locator('header a.brand').boundingBox();
		const bandContent = await band(page).locator('span').first().boundingBox();
		expect(wordmark).not.toBeNull();
		expect(bandContent).not.toBeNull();
		expect(Math.abs((bandContent?.x ?? 0) - (wordmark?.x ?? 100))).toBeLessThanOrEqual(1);
	});
}
