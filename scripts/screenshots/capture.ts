import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Captures the README screenshots (C125) from the running app in Local Mode on the real content/. Run it with
// `npx playwright test -c playwright.screenshots.config.ts`. The images are the app's own render: never edit them.
const OUT = 'docs/assets/screenshots';

// The first Topic in content/content.json, its first Chapter, and that Chapter's first Problem.
const pages = [
	{ name: 'map', path: '/' },
	{ name: 'topic', path: '/topics/dynamic-arrays' },
	{ name: 'chapter', path: '/chapters/dynamic-arrays-cpython-list' },
	{ name: 'problem', path: '/problems/dynamic-arrays-append' }
];

test('capture the Map, a Topic, a Chapter and a Problem in light and dark', async ({ browser }) => {
	test.setTimeout(5 * 60_000);
	mkdirSync(OUT, { recursive: true });

	for (const scheme of ['light', 'dark'] as const) {
		// The app follows prefers-color-scheme when no theme is chosen.
		const context = await browser.newContext({
			colorScheme: scheme,
			viewport: { width: 1440, height: 900 }
		});
		const page = await context.newPage();

		// A fresh database shows Setup first: choose Local through the real screen.
		await page.goto('/setup');
		await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
		// The second context finds the Instance already set up, so only the first has a button to press.
		const start = page.getByRole('button', { name: 'Start in Local mode →' });
		if (await start.isVisible()) {
			await start.click();
			await expect(page).not.toHaveURL(/\/setup/);
		}

		for (const { name, path } of pages) {
			await page.goto(path);
			await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
			await page.evaluate(() => document.fonts.ready);
			await page.waitForLoadState('networkidle');
			await page.screenshot({ path: `${OUT}/${name}-${scheme}.png` });
		}
		await context.close();
	}
});
