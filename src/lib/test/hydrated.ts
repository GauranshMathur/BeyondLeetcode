import type { Locator, Page, Response } from '@playwright/test';

// C92 (#320): the root layout sets `data-hydrated` on <html> once SvelteKit has hydrated the page. A test that
// fills or clicks before then can have its input undone by hydration (Sign in's email is cleared, a tab button
// ignores an Enter). The marker survives client-side navigations, but every full page load (goto, reload, a form
// post that lands on a new document) starts a document without it, so wait after each of those.
//
// Never use these where JavaScript is off (`javaScriptEnabled: false`): such a page never hydrates.

/** Waits until the current document has hydrated. After a click that loads a new document, assert the
 * landing first (a URL or heading), or the old document's marker answers at once. */
export async function waitHydrated(page: Page): Promise<void> {
	await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
}

/** `page.goto`, then waits for hydration. Returns the response, as `goto` does. */
export async function gotoHydrated(
	page: Page,
	url: string,
	options?: Parameters<Page['goto']>[1]
): Promise<Response | null> {
	const response = await page.goto(url, options);
	await waitHydrated(page);
	return response;
}

/** `page.reload`, then waits for hydration. */
export async function reloadHydrated(
	page: Page,
	options?: Parameters<Page['reload']>[0]
): Promise<Response | null> {
	const response = await page.reload(options);
	await waitHydrated(page);
	return response;
}

/** Clicks (or taps) a button that submits a plain form POST, which lands on a new document, and waits for that
 * document to hydrate. It clears the marker first, so the old document's cannot answer. Only for a button that
 * always loads a new document: on a client-side navigation nothing would set the marker again. */
export async function submitHydrated(
	button: Locator,
	action: 'click' | 'tap' = 'click'
): Promise<void> {
	const page = button.page();
	await page.evaluate(() => {
		delete document.documentElement.dataset.hydrated;
	});
	await button[action]();
	await waitHydrated(page);
}
