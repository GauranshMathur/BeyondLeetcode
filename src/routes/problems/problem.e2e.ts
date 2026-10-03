import { expect, type Page, test } from '@playwright/test';

// Click into the editor, wait until CodeMirror has focus, then type at a human pace. Typing with
// no delay straight after the click races CodeMirror's selection sync and can move the cursor.
async function typeInEditor(page: Page, text: string) {
	const editor = page.getByLabel('Code: main.py');
	await editor.click();
	await expect(editor).toBeFocused();
	await page.keyboard.type(text, { delay: 25 });
}

test('a Problem shows its statement and Example Tests, and typed code survives a reload', async ({
	page
}) => {
	await page.goto('/chapters/stacks-undo-log');
	await page.getByRole('link', { name: 'Push and size' }).click();
	await expect(page).toHaveURL('/problems/stacks-push');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Push and size');
	await expect(page.getByText('Example 1')).toBeVisible();
	await expect(page.locator('pre').filter({ hasText: 'push 1' })).toContainText('Output');
	await expect(page.getByRole('status')).toHaveText('saved');

	await typeInEditor(page, 'print(42)');
	await expect(page.getByRole('status')).toHaveText('edited');
	await expect(page.getByRole('status')).toHaveText('saved');

	await page.reload();
	await expect(page.getByLabel('Code: main.py')).toContainText('print(42)');
});

test('a second tab with a stale revision is told to reload', async ({ page, context }) => {
	await page.goto('/problems/stacks-pop');
	const other = await context.newPage();
	await other.goto('/problems/stacks-pop');

	await typeInEditor(page, '# one');
	await expect(page.getByRole('status')).toHaveText('saved');

	await typeInEditor(other, '# two');
	await expect(other.getByRole('status')).toHaveText('edited elsewhere — reload');

	await other.reload();
	await expect(other.getByLabel('Code: main.py')).toContainText('# one');
});

test('a Problem in a Locked Topic returns 403 and an unknown one 404', async ({ page }) => {
	expect((await page.goto('/problems/queues-enqueue'))?.status()).toBe(403);
	expect((await page.goto('/problems/nope'))?.status()).toBe(404);
});

test('edits typed just before leaving are still saved', async ({ page }) => {
	await page.goto('/problems/stacks-peek');
	await typeInEditor(page, '# last second');
	await page.goto('/');

	await page.goto('/problems/stacks-peek');
	await expect(page.getByLabel('Code: main.py')).toContainText('# last second');
});
