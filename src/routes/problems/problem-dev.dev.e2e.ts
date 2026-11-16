import { expect, type Locator, type Page, type Route, test } from '@playwright/test';
import { asLearner } from '../../lib/e2e-learner.ts';
import { expectNoSidewaysScroll, expectTargets, phone } from '../../lib/e2e-phone.ts';
import { gotoHydrated } from '../../lib/test/hydrated.ts';

// Runs in the "dev" project, against a Local Instance started with the dev-mode switch (the fourth server) and
// the scripted Runner, which prints every expected output of a Problem's Reference Code in any Language, so
// every row passes unless a test changes the answer. This file acts as its own Learner.
test.use({ storageState: asLearner('e2e-problem-dev') });

const consoleRegion = (page: Page) => page.getByRole('region', { name: 'Console' });
const devButton = (page: Page) => page.getByRole('button', { name: 'Dev', exact: true });
const view = (page: Page) =>
	page.getByRole('region', { name: 'Dev mode: run the reference solution' });
const runButton = (page: Page) => view(page).getByRole('button', { name: /^Run(ning)? reference/ });
const picker = (page: Page) => view(page).getByLabel('reference language');
const viewStatus = (page: Page) => view(page).getByRole('status');
const table = (page: Page, language: string) =>
	view(page).getByRole('table', { name: `Reference solution results, ${language}` });

/** Each row of a results table as its cells joined by " · ". */
const rowsOf = (results: Locator) =>
	results.locator('tbody tr').evaluateAll((rows) =>
		rows.map((row) =>
			Array.from(row.children)
				.map((cell) => cell.textContent?.trim())
				.join(' · ')
		)
	);

async function openDev(page: Page, path: string) {
	await gotoHydrated(page, path);
	await devButton(page).click();
	await expect(devButton(page)).toHaveAttribute('aria-pressed', 'true');
}

const answerWith = (page: Page, problem: string, handler: (route: Route) => Promise<void>) =>
	page.route(`**/problems/${problem}?/runReference`, handler);

test('a fresh Learner gets a row per Test in each Language, and nothing of theirs changes', async ({
	page
}) => {
	const sent: string[] = [];
	page.on('request', (request) => {
		const match = /\?\/(save|run|submit)$/.exec(request.url());
		if (match && request.method() === 'POST') sent.push(match[1]);
	});
	await gotoHydrated(page, '/problems/heaps-insert');
	await page.getByLabel('Code: main.py').click();
	await page.keyboard.type('# mine', { delay: 25 });
	await expect(page.locator('.status:visible')).toHaveText('saved');
	const savesBefore = sent.length;
	await devButton(page).click();

	for (const [id, name] of [
		['python', 'Python'],
		['typescript', 'TypeScript'],
		['go', 'Go']
	] as const) {
		await picker(page).selectOption(id);
		await runButton(page).click();
		await expect(table(page, name)).toBeVisible();
		expect(await rowsOf(table(page, name))).toEqual(['01 · Example · pass', '01 · Hidden · pass']);
		await expect(viewStatus(page)).toContainText('Reference passed');
		await expect(viewStatus(page)).toContainText('2 of 2 passed');
		await expect(view(page)).toContainText('1 Example Test · 1 Hidden Test');
	}

	await page.getByRole('button', { name: 'Tests', exact: true }).click();
	await expect(page.getByLabel('Code: main.py')).toContainText('# mine');
	await expect(page.getByLabel('build language')).toHaveValue('python');
	await expect(page.getByRole('group', { name: 'Switch build language' })).toHaveCount(0);
	expect(sent.length).toBe(savesBefore);
	await gotoHydrated(page, '/topics/heaps');
	await expect(page.getByText(/0 of 1 core solved/)).toBeVisible();
});

test('an earlier step’s Tests are listed in the core’s order', async ({ page }) => {
	await openDev(page, '/problems/stacks-pop');
	await runButton(page).click();
	await expect(table(page, 'Python')).toBeVisible();
	expect(await rowsOf(table(page, 'Python'))).toEqual([
		'01 · Example · pass',
		'stacks-push · 01 · Example · pass',
		'stacks-push · 01 · Hidden · pass',
		'01 · Hidden · pass'
	]);
	await expect(viewStatus(page)).toContainText('4 of 4 passed');
	await expect(view(page)).toContainText('2 Example Tests · 2 Hidden Tests');
});

test('a run in flight is shown, sends nothing twice, and is dropped when the language changes', async ({
	page
}) => {
	let seen = 0;
	let release: () => void = () => {};
	let held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await answerWith(page, 'stacks-push', async (route) => {
		seen += 1;
		await held;
		await route.continue();
	});
	await openDev(page, '/problems/stacks-push');
	await runButton(page).click();
	await expect(runButton(page)).toHaveText('Running reference…');
	await expect(runButton(page)).toHaveAttribute('aria-disabled', 'true');
	await expect(runButton(page)).toBeFocused();
	await expect(viewStatus(page)).toContainText('Running');
	await expect(view(page)).toContainText('Waiting for the runner…');
	await runButton(page).click({ force: true });
	await runButton(page).press('Enter');
	release();
	await expect(table(page, 'Python')).toBeVisible();
	expect(seen).toBe(1);
	await expect(runButton(page)).toHaveText('Run reference solution');
	await expect(runButton(page)).toBeFocused();

	// A second held run whose language changes before release shows nothing after release.
	held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await runButton(page).click();
	await expect(viewStatus(page)).toContainText('Running');
	await picker(page).selectOption('go');
	await expect(viewStatus(page)).toHaveText('');
	release();
	await expect.poll(() => seen).toBe(2);
	await expect(table(page, 'Python')).toHaveCount(0);
	await expect(table(page, 'Go')).toHaveCount(0);
	await expect(viewStatus(page)).toHaveText('');
});

test('a failing result says Reference failed and shows no input, expected or got', async ({
	page
}) => {
	await answerWith(page, 'stacks-push', async (route) => {
		const response = await route.fetch();
		const body = (await response.text()).replaceAll('passed', 'wrongAnswer');
		await route.fulfill({ response, body });
	});
	await openDev(page, '/problems/stacks-push');
	await runButton(page).click();
	await expect(table(page, 'Python')).toBeVisible();
	await expect(viewStatus(page)).toContainText('Reference failed');
	await expect(viewStatus(page)).toContainText('0 of 2 passed');
	expect(await rowsOf(table(page, 'Python'))).toContain('01 · Hidden · fail · wrong answer');
	await expect(view(page)).not.toContainText(/input|expected|got/);
	await expect(view(page).getByRole('button', { name: /details/i })).toHaveCount(0);
});

test('Runner unavailable keeps the button enabled so pressing it again is the retry', async ({
	page
}) => {
	let seen = 0;
	await answerWith(page, 'stacks-push', async (route) => {
		seen += 1;
		await route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({ type: 'error', status: 503, error: { message: 'RunnerUnavailable' } })
		});
	});
	await openDev(page, '/problems/stacks-push');
	await runButton(page).click();
	await expect(viewStatus(page)).toContainText('Runner unavailable');
	await expect(viewStatus(page)).toContainText('no tests ran');
	await expect(
		page.getByRole('alert').filter({ hasText: 'The runner is unavailable. Try again.' })
	).toBeVisible();
	await expect(view(page)).toContainText('reference solution not run');
	await expect(view(page)).toContainText('your code untouched');
	await expect(runButton(page)).not.toHaveAttribute('aria-disabled', 'true');
	await runButton(page).click();
	await expect.poll(() => seen).toBe(2);
});

test('the keyboard reaches every control and a screen reader gets names', async ({ page }) => {
	await gotoHydrated(page, '/problems/stacks-push');
	await devButton(page).focus();
	await page.keyboard.press('Enter');
	await expect(devButton(page)).toHaveAttribute('aria-pressed', 'true');
	await expect(view(page)).toBeVisible();

	await page.keyboard.press('Tab');
	await expect(picker(page)).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(picker(page)).toHaveValue('typescript');
	await page.keyboard.press('Tab');
	await expect(runButton(page)).toBeFocused();
	await expect(runButton(page)).toHaveAccessibleDescription(
		'Runs the reference solution on every Test. Your code is not touched.'
	);
	await page.keyboard.press('Enter');
	await expect(table(page, 'TypeScript')).toBeVisible();
	await expect(runButton(page)).toBeFocused();

	await expect(table(page, 'TypeScript').getByRole('rowheader')).toHaveText(['01', '01']);
	await expect(page.getByRole('region', { name: 'Dev mode', exact: true })).toHaveCount(1);
});

test('a Run or Submit returns the console to Tests, and the dev result is still there afterwards', async ({
	page
}) => {
	await openDev(page, '/problems/stacks-push');
	await runButton(page).click();
	await expect(table(page, 'Python')).toBeVisible();

	await page.getByRole('button', { name: 'Run', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Tests', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('listitem', { name: 'Example Test 01' })).toBeVisible();
	await expect(view(page)).toHaveCount(0);

	await devButton(page).click();
	await expect(table(page, 'Python')).toBeVisible();
	await expect(consoleRegion(page)).toBeVisible();
});

test.describe('on a phone', () => {
	test.use(phone);

	test('the dev run is a list, every target is 44px tall and the page does not scroll', async ({
		page
	}) => {
		await gotoHydrated(page, '/problems/stacks-push');
		await page
			.getByRole('navigation', { name: 'Workspace' })
			.getByRole('button', { name: 'Tests' })
			.tap();
		await devButton(page).tap();
		await runButton(page).tap();
		const list = view(page).getByRole('list', { name: 'Reference solution results, Python' });
		await expect(list.getByRole('listitem')).toHaveCount(2);
		await expect(view(page).getByRole('table')).toHaveCount(0);
		await expectTargets(consoleRegion(page), 44);
		await expectNoSidewaysScroll(page);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollHeight - document.documentElement.clientHeight
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});
