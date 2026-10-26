import { expect, type Page, test } from '@playwright/test';
import { asLearner } from '../../lib/e2e-learner.ts';
import { gotoHydrated } from '../../lib/test/hydrated.ts';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ storageState: asLearner('e2e-settings') });

const paper = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// Choosing only submits once the page has hydrated (the Save button goes away then), and the choice
// only counts once the server has answered: a select before that, or a goto right after it, loses it.
async function chooseTheme(page: Page, theme: 'light' | 'dark' | 'system') {
	await expect(page.getByRole('button', { name: 'Save theme' })).toHaveCount(0);
	const saved = page.waitForResponse((r) => r.url().includes('?/theme'));
	await page.getByLabel('Theme').selectOption(theme);
	await saved;
}

const LIGHT = 'rgb(243, 238, 228)';
const DARK = 'rgb(23, 21, 18)';

test('the nav links Local to Settings', async ({ page }) => {
	await gotoHydrated(page, '/');
	await page
		.getByRole('navigation', { name: 'Primary' })
		.getByRole('link', { name: 'Local' })
		.click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
	await expect(page.getByRole('link', { name: 'Local' })).toHaveAttribute('aria-current', 'page');
});

test('dark wins on the next load whatever the device prefers, and follow-my-device restores it', async ({
	browser
}) => {
	const context = await browser.newContext({
		storageState: asLearner('e2e-settings'),
		colorScheme: 'light'
	});
	const page = await context.newPage();
	await gotoHydrated(page, '/settings');
	expect(await paper(page)).toBe(LIGHT);

	await chooseTheme(page, 'dark');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

	// Next load, another page: the server render is already dark.
	const response = await page.goto('/');
	expect(await response?.text()).toContain('data-theme="dark"');
	expect(await paper(page)).toBe(DARK);

	await gotoHydrated(page, '/settings');
	await chooseTheme(page, 'system');
	await gotoHydrated(page, '/');
	await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
	expect(await paper(page)).toBe(LIGHT);
	await context.close();
});

test('light wins on a dark device', async ({ browser }) => {
	const context = await browser.newContext({
		storageState: asLearner('e2e-settings'),
		colorScheme: 'dark'
	});
	const page = await context.newPage();
	await gotoHydrated(page, '/');
	expect(await paper(page)).toBe(DARK);
	await gotoHydrated(page, '/settings');
	await chooseTheme(page, 'light');
	await gotoHydrated(page, '/');
	expect(await paper(page)).toBe(LIGHT);
	await context.close();
});

test('the form works without JavaScript', async ({ browser }) => {
	const context = await browser.newContext({
		storageState: asLearner('e2e-settings'),
		javaScriptEnabled: false,
		colorScheme: 'light'
	});
	const page = await context.newPage();
	await page.goto('/settings');
	await page.getByLabel('Theme').selectOption('dark');
	await page.getByRole('button', { name: 'Save theme' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await context.close();
});

// The solution for stacks-push: the fixture's Reference Code, which passes all its Tests.
const correct = `import sys

items = []
for line in sys.stdin.read().splitlines():
    parts = line.split()
    if not parts:
        continue
    if parts[0] == "push":
        items.append(int(parts[1]))
    elif parts[0] == "size":
        print(len(items))
`;

async function solvePush(page: import('@playwright/test').Page) {
	await gotoHydrated(page, '/problems/stacks-push');
	const editor = page.getByLabel('Code: main.py');
	await editor.click();
	await expect(editor).toBeFocused();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.insertText(correct);
	await page.getByRole('button', { name: 'Submit' }).click();
	await expect(page.getByLabel('Verdict')).toContainText('Accepted', { timeout: 60_000 });
}

const solvedStacks = (page: import('@playwright/test').Page) =>
	page.getByRole('link', { name: 'Stacks, unlocked, 1 of 2 core problems solved' });

test('cancelling the Reset progress confirm changes nothing; confirming makes the Map new', async ({
	page
}) => {
	await solvePush(page);

	await gotoHydrated(page, '/settings');
	await expect(
		page.getByText(
			'Deletes the Chapters you have read, your saved code, your Submissions and the Hints you have revealed.'
		)
	).toBeVisible();
	await expect(page.getByRole('group', { name: 'Reset progress' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Reset progress' }).click();
	const confirm = page.getByRole('group', { name: 'Reset progress' });
	await expect(confirm).toContainText('Reset all progress?');
	await expect(confirm).toContainText('This cannot be undone. Your theme is kept.');

	await confirm.getByRole('link', { name: 'Cancel' }).click();
	await expect(page.getByRole('group', { name: 'Reset progress' })).toHaveCount(0);
	await gotoHydrated(page, '/');
	await expect(solvedStacks(page)).toBeVisible();

	await gotoHydrated(page, '/settings');
	await chooseTheme(page, 'dark');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.getByRole('button', { name: 'Reset progress' }).click();
	await page
		.getByRole('group', { name: 'Reset progress' })
		.getByRole('button', { name: 'Reset progress' })
		.click();

	await expect(page).toHaveURL(/\/$/);
	await expect(
		page.getByRole('link', { name: 'Stacks, unlocked, 0 of 2 core problems solved' })
	).toBeVisible();
	// The theme is not progress.
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await gotoHydrated(page, '/settings');
	await chooseTheme(page, 'system');
	await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
});

test('the Reset progress confirm works without JavaScript', async ({ browser }) => {
	const context = await browser.newContext({
		storageState: asLearner('e2e-settings'),
		javaScriptEnabled: false
	});
	const page = await context.newPage();
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Reset progress' }).click();
	await expect(page.getByRole('group', { name: 'Reset progress' })).toBeVisible();
	await page.getByRole('link', { name: 'Cancel' }).click();
	await expect(page.getByRole('group', { name: 'Reset progress' })).toHaveCount(0);
	await context.close();
});

test('no response can be framed: a page and a form action refuse it', async ({ page, baseURL }) => {
	const refuses = (headers: Record<string, string>) => {
		expect(headers['content-security-policy']).toBe("frame-ancestors 'none'");
		expect(headers['x-frame-options']).toBe('DENY');
	};
	refuses((await page.request.get('/settings')).headers());
	const action = await page.request.post('/settings?/theme', {
		form: { theme: 'light' },
		headers: { origin: baseURL ?? '' }
	});
	expect(action.ok()).toBe(true);
	refuses(action.headers());
	// A redirect from an action carries them too.
	const redirect = await page.request.post('/settings?/reset', {
		form: {},
		headers: { origin: baseURL ?? '', accept: 'text/html' },
		maxRedirects: 0
	});
	expect(redirect.status()).toBe(303);
	refuses(redirect.headers());
});
