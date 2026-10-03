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

test('error pages under /problems keep the site header, a Problem page does not', async ({
	page
}) => {
	const siteNav = page.getByRole('navigation', { name: 'Primary' });
	for (const path of ['/problems/queues-enqueue', '/problems/nope']) {
		await page.goto(path);
		await expect(siteNav.getByRole('link', { name: 'Map' })).toBeVisible();
	}

	await page.goto('/problems/stacks-push');
	await expect(siteNav).toHaveCount(0);
	await expect(page.locator('header')).toHaveCount(1);
	await expect(page.locator('header.workspace-bar')).toBeVisible();
});

test('edits typed just before leaving are still saved', async ({ page }) => {
	await page.goto('/problems/stacks-peek');
	await typeInEditor(page, '# last second');
	await page.goto('/');

	await page.goto('/problems/stacks-peek');
	await expect(page.getByLabel('Code: main.py')).toContainText('# last second');
});

// The solution for stacks-push: the fixture's Reference Code, which passes its Example Test.
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

async function setCode(page: Page, code: string) {
	const editor = page.getByLabel('Code: main.py');
	await editor.click();
	await expect(editor).toBeFocused();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.insertText(code);
}

test('Run shows pass for a correct solution and fail for a wrong one', async ({ page }) => {
	await page.goto('/problems/stacks-push');

	await setCode(page, correct);
	await page.getByRole('button', { name: 'Run' }).click();
	const row = page.getByRole('listitem', { name: 'Example Test 01' });
	await expect(row).toContainText('pass', { timeout: 60_000 });
	await expect(page.getByText('1 of 1 passed')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled();

	await setCode(page, 'print(99)\n');
	await page.keyboard.press('ControlOrMeta+Enter');
	// The shortcut runs the code; the editor must not insert a blank line.
	await expect(page.locator('.cm-line')).toHaveCount(2);
	await expect(row).toContainText('fail · wrong answer', { timeout: 60_000 });
	await expect(row).toContainText('99');
	await expect(row).toContainText('expected');
	await expect(page.getByText('0 of 1 passed')).toBeVisible();

	// Run never changes progress: the Problem is not Solved.
	await page.goto('/topics/stacks');
	await expect(page.getByText('core solved').locator('..')).toContainText('0 of 2');
});

test('Run shows a runtime error and a compile error block', async ({ page }) => {
	await page.goto('/problems/stacks-push');

	await setCode(page, 'raise ValueError("boom")\n');
	await page.getByRole('button', { name: 'Run' }).click();
	const row = page.getByRole('listitem', { name: 'Example Test 01' });
	await expect(row).toContainText('fail · runtime error', { timeout: 60_000 });
	await expect(row).toContainText('ValueError: boom');

	await setCode(page, 'def (:\n');
	await page.getByRole('button', { name: 'Run' }).click();
	await expect(page.getByLabel('Compile error')).toContainText('SyntaxError', { timeout: 60_000 });
});

test('Submit a wrong answer shows Wrong Answer, then the correct Reference Code is Accepted and Solved', async ({
	page
}) => {
	await page.goto('/problems/stacks-push');

	await setCode(page, 'print(99)\n');
	await page.getByRole('button', { name: 'Submit' }).click();
	const verdict = page.getByLabel('Verdict');
	await expect(verdict).toHaveText('Wrong Answer', { timeout: 60_000 });
	await expect(page.getByLabel('Failed Example Test 01')).toContainText('99');
	await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();

	await page.goto('/topics/stacks');
	await expect(page.getByText('core solved').locator('..')).toContainText('0 of 2');

	await page.goto('/problems/stacks-push');
	await setCode(page, correct);
	await page.getByRole('button', { name: 'Submit' }).click();
	await expect(verdict).toContainText('Accepted', { timeout: 60_000 });
	const panel = page.getByLabel('Accepted panel');
	await expect(panel.getByRole('link', { name: 'Next problem' })).toHaveAttribute(
		'href',
		'/problems/stacks-pop'
	);
	await expect(panel).not.toContainText('Topic complete');

	await page.goto('/topics/stacks');
	await expect(page.getByText('core solved').locator('..')).toContainText('1 of 2');
	await expect(page.getByRole('row', { name: /^Push and size/ })).toContainText('solved');
});

test('Run and Submit sit in the 64px workspace bar with 10px clearance at 1440x1000', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/problems/stacks-push');

	const bar = page.getByRole('banner');
	await expect(bar).toHaveCount(1);
	const barBox = await bar.boundingBox();
	if (!barBox) throw new Error('workspace bar has no box');
	expect(barBox.height).toBe(64);

	for (const name of ['Run', 'Submit']) {
		const box = await page.getByRole('button', { name }).boundingBox();
		if (!box) throw new Error(`${name} has no box`);
		expect(box.height).toBe(44);
		expect(box.y - barBox.y).toBeGreaterThanOrEqual(10);
		expect(barBox.y + barBox.height - (box.y + box.height)).toBeGreaterThanOrEqual(10);
	}
	await expect(bar.getByRole('link', { name: 'map' })).toBeVisible();
});
