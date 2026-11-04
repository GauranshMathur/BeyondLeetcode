import { expect, type Locator, type Page } from '@playwright/test';

/** Test-only: the one phone. Layout tests and flows alike use it (touch on, so a flow taps). */
export const phone = { viewport: { width: 390, height: 844 }, hasTouch: true } as const;

/** The page is no wider than the screen. */
export async function expectNoSidewaysScroll(page: Page) {
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
}

/** Every visible link, button, select and input inside `scope` is at least `min` px tall. */
export async function expectTargets(scope: Page | Locator, min: number) {
	const targets = scope.locator('a, button, select, input').filter({ visible: true });
	for (const target of await targets.all()) {
		const box = await target.boundingBox();
		const label = (await target.textContent())?.trim() || (await target.getAttribute('aria-label'));
		expect(box?.height ?? 0, `target "${label}"`).toBeGreaterThanOrEqual(min);
	}
}

/** The locator is a bar exactly `height` px tall (its rule included). */
export async function expectBarHeight(locator: Locator, height: number) {
	expect((await locator.boundingBox())?.height).toBe(height);
}

/**
 * Scroll a Chapter to its end and wait for the reach-end save. A phone hides the read marker, so the saved
 * mark itself is what to wait for. A short Chapter has its end in view on load and posts during the load, so
 * the wait is registered before the scroll; call this right after the page loads, or pass a `navigate` that
 * opens the Chapter so the wait is registered first.
 */
export async function readToEnd(page: Page, navigate?: () => Promise<unknown>) {
	const marked = page.waitForResponse(/\?\/reachEnd/);
	await navigate?.();
	await page.locator('main').evaluate((el) => el.lastElementChild?.scrollIntoView());
	expect((await marked).ok()).toBe(true);
}

/** A tab of the problem Workspace's phone tab bar. */
export function workspaceTab(page: Page, name: string) {
	return page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name });
}
