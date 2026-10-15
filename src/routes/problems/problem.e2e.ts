import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { asLearner } from '../../lib/e2e-learner.ts';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ storageState: asLearner('e2e-problem') });

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

// The solution for stacks-push: the fixture's Reference Code, which passes its Example Test. The scripted
// Runner recognises it by content, so it is read from disk rather than copied here.
const referenceCode = (file: string, language: string) =>
	readFileSync(
		`src/lib/server/content/fixture/topics/stacks/chapters/stacks-undo-log/problems/stacks-push/reference/${language}/${file}`,
		'utf8'
	);
const correct = referenceCode('main.py', 'python');

async function setCode(page: Page, code: string, file = 'main.py') {
	const editor = page.getByLabel(`Code: ${file}`);
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

	// Solved or not, the Solution is open and the status stays Solved.
	await page.goto('/problems/stacks-push?tab=solution');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Solution');
	await page.goto('/topics/stacks');
	await expect(page.getByRole('row', { name: /^Push and size/ })).toContainText('solved');
});

// A string literal is coloured by the editor's highlight style, not the plain text colour.
async function expectStringHighlighted(page: Page, literal: string) {
	const colourOf = (selector: string) => async () =>
		page
			.locator(selector)
			.first()
			.evaluate((el) => getComputedStyle(el).color);
	const token = page.locator('.cm-line span', { hasText: literal }).first();
	await expect(token).toBeVisible();
	const plain = await colourOf('.cm-content')();
	await expect.poll(() => token.evaluate((el) => getComputedStyle(el).color)).not.toBe(plain);
}

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

test('the Problem page stays one screen tall: the statement, the editor and the console scroll on their own', async ({
	page
}) => {
	// A short window makes the fixture's statement and one failing result overflow their panes.
	await page.setViewportSize({ width: 1440, height: 500 });
	await page.goto('/problems/stacks-push');

	// Enough lines that the editor needs its own scrollbar.
	await setCode(page, `${'x = 1\n'.repeat(60)}print(99)\n`);
	await page.getByRole('button', { name: 'Run' }).click();
	const row = page.getByRole('listitem', { name: 'Example Test 01' });
	await expect(row).toContainText('fail · wrong answer', { timeout: 60_000 });

	const doc = await page.evaluate(() => ({
		scrollHeight: window.document.documentElement.scrollHeight,
		innerHeight: window.innerHeight
	}));
	expect(doc.scrollHeight).toBe(doc.innerHeight);

	const statement = page.getByRole('region', { name: 'Problem statement' });
	await expect(statement).toHaveAttribute('tabindex', '0');
	expect(await statement.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
	const console_ = page.getByRole('region', { name: 'Test results' });
	await expect(console_).toHaveAttribute('tabindex', '0');
	expect(await console_.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
	expect(
		await page.locator('.cm-scroller').evaluate((el) => el.scrollHeight > el.clientHeight)
	).toBe(true);

	// Scrolling a pane moves that pane only; the tab row and Run stay where they are.
	await statement.evaluate((el) => el.scrollTo(0, el.scrollHeight));
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
	await expect(page.getByRole('navigation', { name: 'Problem sections' })).toBeInViewport();
	for (const name of ['Run', 'Submit']) {
		await expect(page.getByRole('button', { name })).toBeInViewport({ ratio: 1 });
	}

	// The console never takes more than about half of the right pane.
	const pane = await page.locator('.pane').boundingBox();
	const consoleBox = await page.getByLabel('Console').boundingBox();
	if (!pane || !consoleBox) throw new Error('missing pane boxes');
	expect(consoleBox.height).toBeLessThanOrEqual(pane.height / 2 + 1);
	expect(consoleBox.y + consoleBox.height).toBeLessThanOrEqual(500);
});

const correctTypeScript = referenceCode('main.ts', 'typescript');

test('switching to TypeScript asks first, keeps the Python build, and Run passes', async ({
	page
}) => {
	await page.goto('/problems/stacks-push');
	await setCode(page, '# my python build\n');
	await expect(page.getByRole('status')).toHaveText('saved');

	const picker = page.getByLabel('build language');
	await expect(picker.locator('option')).toHaveText(['Python', 'TypeScript', 'Go']);

	// Cancel changes nothing.
	await picker.selectOption('typescript');
	const confirm = page.getByRole('group', { name: 'Switch build language' });
	await expect(confirm).toContainText('Switch to TypeScript?');
	await expect(confirm).toContainText('Your Python build is kept.');
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(confirm).toHaveCount(0);
	await expect(picker).toHaveValue('python');

	try {
		await picker.selectOption('typescript');
		await confirm.getByRole('button', { name: 'Switch language' }).click();
		await expect(page.getByLabel('Code: main.ts')).toBeVisible();
		await expect(picker).toHaveValue('typescript');

		await setCode(page, correctTypeScript, 'main.ts');
		await expectStringHighlighted(page, "'node:fs'");
		await page.getByRole('button', { name: 'Run' }).click();
		await expect(page.getByRole('listitem', { name: 'Example Test 01' })).toContainText('pass', {
			timeout: 60_000
		});
	} finally {
		await page.getByLabel('build language').selectOption('python');
		await page.getByRole('button', { name: 'Switch language' }).click();
		await expect(page.getByLabel('Code: main.py')).toContainText('# my python build');
	}
});

test('a tab left on one Language is told to reload after another tab switches Language', async ({
	page,
	context
}) => {
	await page.goto('/problems/stacks-pop');
	const stale = await context.newPage();
	await stale.goto('/problems/stacks-pop');

	try {
		await page.getByLabel('build language').selectOption('typescript');
		await page.getByRole('button', { name: 'Switch language' }).click();
		await expect(page.getByLabel('Code: main.ts')).toBeVisible();

		await typeInEditor(stale, '# stale');
		await expect(stale.getByRole('status')).toHaveText('edited elsewhere — reload');
	} finally {
		await page.getByLabel('build language').selectOption('python');
		await page.getByRole('button', { name: 'Switch language' }).click();
		await expect(page.getByLabel('Code: main.py')).toBeVisible();
	}
});

const correctGo = referenceCode('main.go', 'go');

test('switching to Go keeps the Python build, and Run passes', async ({ page }) => {
	await page.goto('/problems/stacks-push');
	await setCode(page, '# my python build\n');
	await expect(page.getByRole('status')).toHaveText('saved');

	const picker = page.getByLabel('build language');
	try {
		await picker.selectOption('go');
		const confirm = page.getByRole('group', { name: 'Switch build language' });
		await expect(confirm).toContainText('Switch to Go?');
		await confirm.getByRole('button', { name: 'Switch language' }).click();
		await expect(page.getByLabel('Code: main.go')).toBeVisible();
		await expect(picker).toHaveValue('go');

		await setCode(page, correctGo, 'main.go');
		await expectStringHighlighted(page, '"bufio"');
		await page.getByRole('button', { name: 'Run' }).click();
		await expect(page.getByRole('listitem', { name: 'Example Test 01' })).toContainText('pass', {
			timeout: 60_000
		});
	} finally {
		await page.getByRole('combobox', { name: 'build language' }).selectOption('python');
		await page.getByRole('button', { name: 'Switch language' }).click();
		await expect(page.getByLabel('Code: main.py')).toContainText('# my python build');
	}
});

test('a Problem links to a prefilled new GitHub issue in a new tab', async ({ page }) => {
	await page.goto('/problems/stacks-push');
	const link = page.getByRole('link', { name: /Report an issue/ });
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	const url = new URL((await link.getAttribute('href')) ?? '');
	expect(`${url.origin}${url.pathname}`).toBe(
		'https://github.com/GauranshMathur/BeyondLeetcode/issues/new'
	);
	expect(url.searchParams.get('title')).toBe('Problem: Push and size (stacks-push)');
	expect(url.searchParams.get('body')).toContain('What is wrong');
});

test('Hints reveal one at a time, in order, link to the Chapter, and survive a reload', async ({
	page
}) => {
	await page.goto('/problems/stacks-push');
	await page.getByRole('link', { name: 'Hints' }).click();
	await expect(page).toHaveURL('/problems/stacks-push?tab=hints');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hints');
	await expect(page.getByText('Hint 1 of 2')).toBeVisible();
	await expect(page.getByText('First hint.')).toHaveCount(0);
	await expect(page.getByText('Second hint.')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Reveal hint 2' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Reveal hint 1' }).click();
	await expect(page.getByText('First hint.')).toBeVisible();
	await expect(page.getByText('Second hint.')).toHaveCount(0);
	await expect(page.getByText('Hint 2 of 2')).toBeVisible();

	await page.getByRole('button', { name: 'Reveal hint 2' }).click();
	await expect(page.getByText('Second hint.')).toBeVisible();
	await expect(page.getByRole('button', { name: /Reveal hint/ })).toHaveCount(0);
	await expect(page.getByRole('link', { name: /An undo log/ })).toHaveCount(2);

	await page.reload();
	await expect(page.getByText('First hint.')).toBeVisible();
	await expect(page.getByText('Second hint.')).toBeVisible();

	await page
		.getByRole('link', { name: /An undo log/ })
		.first()
		.click();
	await expect(page).toHaveURL('/chapters/stacks-undo-log');
});

test('the browser receives only the Hints already revealed', async ({ page }) => {
	const body = await (await page.request.get('/problems/stacks-peek?tab=hints')).text();
	expect(body).not.toContain('First hint.');
	expect(body).not.toContain('Second hint.');

	await page.goto('/problems/stacks-peek?tab=hints');
	await page.getByRole('button', { name: 'Reveal hint 1' }).click();
	await expect(page.getByText('First hint.')).toBeVisible();

	const after = await (await page.request.get('/problems/stacks-peek?tab=hints')).text();
	expect(after).toContain('First hint.');
	expect(after).not.toContain('Second hint.');
});

test('the Solution tab shows the explanation and the Reference Code in each Language, and keeps the Learner code', async ({
	page
}) => {
	// Not in the Problem's own page data.
	const plain = await (await page.request.get('/problems/stacks-push')).text();
	expect(plain).not.toContain('readFileSync');

	await page.goto('/problems/stacks-push');
	await typeInEditor(page, '# mine');
	await page.getByRole('link', { name: 'Solution' }).click();
	await expect(page).toHaveURL('/problems/stacks-push?tab=solution');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Solution');
	await expect(page.getByText('Placeholder fixture text')).toBeVisible();
	await expect(page.getByText('reference code · read only')).toBeVisible();

	const language = page.getByRole('navigation', { name: 'Reference code language' });
	const code = page.locator('.viewer .cm-content');
	await expect(language.getByRole('button', { name: 'Python' })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await expect(code).toContainText('items');
	await expect(code).toHaveAttribute('aria-readonly', 'true');
	await code.click();
	await page.keyboard.type('zzz', { delay: 25 });
	await expect(code).not.toContainText('zzz');
	await language.getByRole('button', { name: 'TypeScript' }).click();
	await expect(code).toContainText('readFileSync');
	await language.getByRole('button', { name: 'Go' }).click();
	await expect(code).toContainText('package main');

	// The Learner's own code was saved and is back when the Problem tab is.
	await page.getByRole('link', { name: 'Problem', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('saved');
	await expect(page.getByLabel('Code: main.py')).toContainText('# mine');
	await page.reload();
	await expect(page.getByLabel('Code: main.py')).toContainText('# mine');
});

test('Start from reference code asks first, cancel changes nothing, confirm puts the previous Problem Reference Code in the editor', async ({
	page
}) => {
	await page.goto('/problems/stacks-pop');
	await setCode(page, 'broken(\n');
	await expect(page.getByRole('status')).toHaveText('saved');

	await page.getByRole('button', { name: 'Start from reference code' }).click();
	const confirm = page.getByRole('group', { name: 'Start from reference code' });
	await expect(confirm).toBeVisible();
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(confirm).toHaveCount(0);
	await expect(page.getByLabel('Code: main.py')).toContainText('broken(');

	await page.getByRole('button', { name: 'Start from reference code' }).click();
	await confirm.getByRole('button', { name: 'Replace my code' }).click();
	// The Reference Code after stacks-push: it handles push and size, not pop yet.
	await expect(page.getByLabel('Code: main.py')).toContainText('items.append(int(parts[1]))');
	await expect(page.getByLabel('Code: main.py')).not.toContainText('broken(');
	await expect(page.getByRole('status')).toHaveText('saved');

	await page.reload();
	await expect(page.getByLabel('Code: main.py')).toContainText('items.append(int(parts[1]))');

	// The new Build is saved with a fresh revision: a Run goes straight through.
	await page.getByRole('button', { name: 'Run' }).click();
	await expect(page.locator('.status')).toHaveText('saved');
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	const tabBar = (page: Page) => page.getByRole('navigation', { name: 'Workspace' });
	const tab = (page: Page, name: string) => tabBar(page).getByRole('button', { name });

	async function expectNoPageScroll(page: Page) {
		const doc = await page.evaluate(() => ({
			scrollHeight: document.documentElement.scrollHeight,
			innerHeight: window.innerHeight,
			scrollWidth: document.documentElement.scrollWidth,
			innerWidth: window.innerWidth
		}));
		expect(doc.scrollHeight).toBe(doc.innerHeight);
		expect(doc.scrollWidth).toBe(doc.innerWidth);
	}

	test('three tabs switch one pane at a time; Run and Submit land on Tests; typed code survives; every target is 44px', async ({
		page
	}) => {
		await page.goto('/problems/stacks-push');

		// The bar is the 56px one: brand left, breadcrumb right, no Run or Submit in it.
		const bar = page.getByRole('banner');
		expect((await bar.boundingBox())?.height).toBe(56);
		await expect(bar.getByRole('button')).toHaveCount(0);

		// Problem tab first: the statement shows, the editor and the console do not.
		await expect(tab(page, 'Problem')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByLabel('Code: main.py')).toBeHidden();
		await expect(page.getByLabel('Console')).toBeHidden();
		// The Problem / Hints / Solution row stays inside the tab.
		await expect(page.getByRole('navigation', { name: 'Problem sections' })).toBeVisible();

		// The strip sits above the tab bar on every tab.
		const strip = async () => {
			const run = await page.getByRole('button', { name: 'Run' }).boundingBox();
			const bar = await tabBar(page).boundingBox();
			if (!run || !bar) throw new Error('missing boxes');
			expect(run.y + run.height).toBeLessThanOrEqual(bar.y);
			expect((await tab(page, 'Tests').boundingBox())?.height).toBe(56);
		};
		await strip();
		await expectNoPageScroll(page);

		await tab(page, 'Code').click();
		await expect(tab(page, 'Code')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('heading', { level: 1 })).toBeHidden();
		await expect(page.getByLabel('Console')).toBeHidden();
		await strip();
		await expectNoPageScroll(page);

		// The language picker is the full 52px select.
		const picker = page.getByLabel('build language');
		expect((await picker.boundingBox())?.height).toBe(52);

		await setCode(page, 'print(99)\n');
		await page.getByRole('button', { name: 'Run' }).click();
		// The result arrives and the Tests tab opens by itself.
		const row = page.getByRole('listitem', { name: 'Example Test 01' });
		await expect(row).toContainText('fail · wrong answer', { timeout: 60_000 });
		await expect(tab(page, 'Tests')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByLabel('Code: main.py')).toBeHidden();
		await strip();
		await expectNoPageScroll(page);

		// Back to Code: the typed code is still there, unsaved edits and all.
		await tab(page, 'Code').click();
		await expect(page.getByLabel('Code: main.py')).toContainText('print(99)');

		await setCode(page, correct);
		await page.getByRole('button', { name: 'Submit' }).click();
		await expect(page.getByLabel('Verdict')).toContainText('Accepted', { timeout: 60_000 });
		await expect(tab(page, 'Tests')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByLabel('Accepted panel')).toBeVisible();
		await expectNoPageScroll(page);

		// Every tab and button on the screen is at least 44px tall.
		for (const name of ['Problem', 'Code', 'Tests']) {
			await tab(page, name).click();
			const targets = page.locator('a:visible, button:visible, select:visible');
			for (const handle of await targets.all()) {
				const box = await handle.boundingBox();
				const label = await handle.evaluate((el) => `${name}: ${el.outerHTML.slice(0, 80)}`);
				expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(44);
			}
		}
	});

	test('switching language on the Code tab stays on the Code tab', async ({ page }) => {
		await page.goto('/problems/stacks-push');
		await tab(page, 'Code').click();
		const picker = page.getByLabel('build language');
		try {
			await picker.selectOption('typescript');
			await page.getByRole('button', { name: 'Switch language' }).click();
			await expect(page.getByLabel('Code: main.ts')).toBeVisible();
			await expect(tab(page, 'Code')).toHaveAttribute('aria-pressed', 'true');
		} finally {
			await page.getByLabel('build language').selectOption('python');
			await page.getByRole('button', { name: 'Switch language' }).click();
			await expect(page.getByLabel('Code: main.py')).toBeVisible();
		}
	});

	test('the tabs work from the keyboard', async ({ page }) => {
		await page.goto('/problems/stacks-push');
		await tab(page, 'Tests').focus();
		await page.keyboard.press('Enter');
		await expect(tab(page, 'Tests')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('region', { name: 'Test results' })).toBeVisible();
	});

	test('with the Solution open, the Tests tab still shows the console', async ({ page }) => {
		await page.goto('/problems/stacks-push?tab=solution');
		await tab(page, 'Tests').click();
		await expect(page.getByLabel('Console')).toBeVisible();
		await expect(page.locator('.cm-content:visible')).toHaveCount(0);
		await expectNoPageScroll(page);
	});
});
