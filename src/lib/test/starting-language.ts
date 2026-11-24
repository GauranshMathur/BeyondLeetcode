import type { Page } from '@playwright/test';

const labels = { python: 'Python', typescript: 'TypeScript', go: 'Go' } as const;

/**
 * Makes the page's Learner choose a starting Language through the real choice form, as a new Learner
 * would. It is a plain form post, so it works with JavaScript off. The page ends on the home page.
 */
export async function chooseStartingLanguage(page: Page, language: keyof typeof labels = 'python') {
	await page.goto('/language');
	await page.getByRole('radio', { name: labels[language] }).check();
	await page.getByRole('button', { name: 'Continue →' }).click();
	await page.waitForURL((url) => url.pathname === '/');
}
