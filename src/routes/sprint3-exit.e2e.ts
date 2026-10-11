import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

// Sprint 3 exit: a Learner in Local mode finishes a Topic and unlocks the next.
// The Reference Code is read from the fixture on disk, not copied here.
const fixture = 'src/lib/server/content/fixture/topics/stacks/chapters';
const referenceCode = (chapter: string, problem: string) =>
	readFileSync(`${fixture}/${chapter}/problems/${problem}/reference/python/main.py`, 'utf8');

async function setCode(page: Page, code: string) {
	const editor = page.getByLabel('Code: main.py');
	await editor.click();
	await expect(editor).toBeFocused();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.insertText(code);
}

async function resetProgress(page: Page) {
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Reset progress' }).click();
	await page
		.getByRole('group', { name: 'Reset progress' })
		.getByRole('button', { name: 'Reset progress' })
		.click();
	await expect(page).toHaveURL(/\/$/);
}

async function readChapter(page: Page, chapter: string) {
	await page.goto(`/chapters/${chapter}`);
	await page.locator('main').evaluate((el) => el.lastElementChild?.scrollIntoView());
	await expect(page.locator('aside').getByText('read', { exact: true })).toBeVisible();
}

async function submitAccepted(page: Page, problem: string, code: string) {
	await page.goto(`/problems/${problem}`);
	await setCode(page, code);
	await page.getByRole('button', { name: 'Submit' }).click();
	await expect(page.getByLabel('Verdict')).toContainText('Accepted', { timeout: 60_000 });
}

test('a Learner reads both Stacks Chapters, solves both Core Problems, and the Map unlocks Queues', async ({
	page
}) => {
	test.setTimeout(240_000);
	await resetProgress(page);
	try {
		await expect(
			page.getByRole('link', { name: 'Stacks, unlocked, 0 of 2 core problems solved' })
		).toBeVisible();

		// A Hint and the Solution tab are help, not progress.
		await page.goto('/problems/stacks-push?tab=hints');
		await page.getByRole('button', { name: 'Reveal hint 1' }).click();
		await expect(page.getByText('First hint.')).toBeVisible();
		await page.goto('/problems/stacks-push?tab=solution');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Solution');
		await page.goto('/topics/stacks');
		await expect(page.getByLabel('Topic progress')).toContainText('0 of 2');
		await expect(page.getByText('core solved').locator('..')).toContainText('0 of 2');
		await expect(page.getByRole('row', { name: /^Push and size/ })).not.toContainText('solved');

		// Read both Chapters to the end and solve their Core Problems.
		await readChapter(page, 'stacks-undo-log');
		await submitAccepted(page, 'stacks-push', referenceCode('stacks-undo-log', 'stacks-push'));
		await expect(page.getByLabel('Accepted panel')).not.toContainText('Topic complete');

		await readChapter(page, 'stacks-call-frames');
		await submitAccepted(page, 'stacks-pop', referenceCode('stacks-call-frames', 'stacks-pop'));

		// The last step completes the Topic and names the one it unlocks.
		const panel = page.getByLabel('Accepted panel');
		await expect(panel).toContainText('Topic complete');
		await expect(panel).toContainText('It unlocks');
		await expect(panel.getByRole('link', { name: 'Queues' })).toHaveAttribute(
			'href',
			'/topics/queues'
		);
		await expect(panel).not.toContainText('Heaps');

		// The Map: Stacks complete, Queues unlocked, Heaps still waiting on Queues.
		await page.goto('/');
		await expect(
			page.getByRole('link', { name: 'Stacks, complete, 2 of 2 core problems solved' })
		).toBeVisible();
		await expect(
			page.getByRole('link', { name: 'Queues, unlocked, 0 of 1 core problems solved' })
		).toHaveAttribute('href', '/topics/queues');
		await expect(page.getByRole('img', { name: /^Heaps, locked/ })).toBeVisible();
	} finally {
		await resetProgress(page);
	}
});
