import { expect, type Locator, type Page, test } from '@playwright/test';

// The canvas boards (Nav, Map, Topic, Chapter) are 1440 wide; these are their control sizes.
test.use({ viewport: { width: 1440, height: 900 } });

async function box(locator: Locator) {
	const b = await locator.first().boundingBox();
	if (!b) throw new Error('element has no box');
	return b;
}

async function expectHeader(page: Page) {
	// padding 24 + 44px link + padding 24 + 1px rule
	expect((await box(page.locator('header'))).height).toBe(93);
	const nav = page.getByRole('navigation', { name: 'Primary' });
	expect((await box(nav.getByRole('link', { name: 'Map', exact: true }))).height).toBe(44);
	expect((await box(page.locator('header .brand'))).x).toBe(96);
}

test('Map: header, heading and Topic nodes match the Map board', async ({ page }) => {
	await page.goto('/');
	await expectHeader(page);
	await expect(page.locator('h1')).toHaveCSS('font-size', '64px');
	// The Topic nodes are the Map's controls: 200 x 64 on the board.
	const node = await box(
		page
			.getByRole('link', { name: /^Stacks, unlocked/ })
			.locator('rect')
			.first()
	);
	// The bounding box includes the 1.25px stroke.
	expect([Math.round(node.width - 1.25), Math.round(node.height - 1.25)]).toEqual([200, 64]);
});

test('Topic: header, title, progress and problem links match the Topic board', async ({ page }) => {
	await page.goto('/topics/stacks');
	await expectHeader(page);
	await expect(page.locator('h1')).toHaveCSS('font-size', '76px');
	await expect(page.locator('h2').first()).toHaveCSS('font-size', '44px');
	await expect(page.locator('section.chapter').first()).toHaveCSS('padding-top', '112px');
	expect(Math.round((await box(page.getByLabel('Topic progress'))).width)).toBe(288);
	expect(
		(await box(page.getByRole('link', { name: 'Push and size' }))).height
	).toBeGreaterThanOrEqual(44);
	expect(
		(await box(page.getByRole('link', { name: 'An undo log' }))).height
	).toBeGreaterThanOrEqual(44);
});

test('Chapter: sidebar, title and links match the Chapter board', async ({ page }) => {
	// Keep this visit from marking the Chapter Read; other tests count Read Chapters.
	await page.route('**/chapters/**', (route) =>
		route.request().method() === 'POST' ? route.abort() : route.continue()
	);
	await page.goto('/chapters/stacks-call-frames');
	await expectHeader(page);
	await expect(page.locator('main > header h1')).toHaveCSS('font-size', '64px');
	await expect(page.locator('main')).toHaveCSS('padding-left', '80px');
	const aside = page.locator('.page > aside');
	expect((await box(aside)).width).toBe(320);
	const crumb = aside.getByRole('link', { name: 'map', exact: true });
	expect((await box(crumb)).height).toBeGreaterThanOrEqual(44);
	expect((await box(page.getByRole('link', { name: 'Pop' }))).height).toBeGreaterThanOrEqual(44);
});
