import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

// The Reference Code is read from the content folder on disk (the image ships the same folder), not copied here.
const problemDir =
	'content/topics/dynamic-arrays/chapters/dynamic-arrays-cpython-list/problems/dynamic-arrays-append';

const languages = [
	{ id: 'python', label: 'Python', file: 'main.py' },
	{ id: 'typescript', label: 'TypeScript', file: 'main.ts' },
	{ id: 'go', label: 'Go', file: 'main.go' }
] as const;

async function setCode(page: Page, code: string, file: string) {
	const editor = page.getByLabel(`Code: ${file}`);
	await editor.click();
	await expect(editor).toBeFocused();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.insertText(code);
}

// The first Run of a Language may wait on starting its Sandbox image.
const slow = { timeout: 180_000 };

test('Map to Topic to Chapter (Read) to Problem, then Run and Submit once per Language', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('link', { name: /^Dynamic arrays, unlocked/ }).click();
	await expect(page).toHaveURL('/topics/dynamic-arrays');

	await page.getByRole('link', { name: 'CPython: a list that leaves room' }).click();
	await expect(page).toHaveURL('/chapters/dynamic-arrays-cpython-list');
	await page.locator('main').evaluate((el) => el.lastElementChild?.scrollIntoView());
	await expect(page.locator('aside').getByText('read', { exact: true })).toBeVisible();

	await page.getByRole('link', { name: 'Append, get and length' }).click();
	await expect(page).toHaveURL('/problems/dynamic-arrays-append');

	for (const language of languages) {
		if (language.id !== 'python') {
			await page.getByLabel('build language').selectOption(language.id);
			const confirm = page.getByRole('group', { name: 'Switch build language' });
			await expect(confirm).toContainText(`Switch to ${language.label}?`);
			await confirm.getByRole('button', { name: 'Switch language' }).click();
			await expect(page.getByLabel(`Code: ${language.file}`)).toBeVisible();
		}

		const code = readFileSync(`${problemDir}/reference/${language.id}/${language.file}`, 'utf8');
		await setCode(page, code, language.file);

		await page.getByRole('button', { name: 'Run' }).click();
		await expect(page.getByRole('listitem', { name: 'Example Test 01' })).toContainText(
			'pass',
			slow
		);
		await expect(page.getByText('2 of 2 passed')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled();

		await page.getByRole('button', { name: 'Submit' }).click();
		await expect(page.getByLabel('Verdict')).toContainText('Accepted', slow);
		await expect(page.getByLabel('Accepted panel')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
	}

	await page.goto('/topics/dynamic-arrays');
	await expect(page.getByRole('row', { name: /^Append, get and length/ })).toContainText('solved');
});
