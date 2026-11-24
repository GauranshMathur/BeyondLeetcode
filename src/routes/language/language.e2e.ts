import { type Browser, expect, test } from '@playwright/test';
import { asLearner } from '../../lib/e2e-learner.ts';
import { gotoHydrated } from '../../lib/test/hydrated.ts';

// Each test acts as a Learner nobody has been before: the time suffix gives a retry a new one too, so no
// earlier choice is already stored.
let counter = 0;
const newLearner = () => asLearner(`e2e-language-${Date.now()}-${counter++}`);

async function openAs(browser: Browser, baseURL: string | undefined, javaScriptEnabled: boolean) {
	const context = await browser.newContext({
		baseURL,
		storageState: newLearner(),
		javaScriptEnabled
	});
	return { context, page: await context.newPage() };
}

test('the choice shows no Language chosen, and no navigation', async ({ browser, baseURL }) => {
	const { context, page } = await openAs(browser, baseURL, false);
	try {
		await page.goto('/language?next=/problems/stacks-push');

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'Which Language do you start with?'
		);
		const radios = page.getByRole('radio');
		await expect(radios).toHaveCount(3);
		for (const name of ['Python', 'TypeScript', 'Go']) {
			await expect(page.getByRole('radio', { name })).not.toBeChecked();
		}
		await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
	} finally {
		await context.close();
	}
});

test('Continue with nothing chosen answers 400 on the same page, with the alert', async ({
	browser,
	baseURL
}) => {
	const { context, page } = await openAs(browser, baseURL, false);
	try {
		await page.goto('/language?next=/problems/stacks-push');
		const [response] = await Promise.all([
			page.waitForResponse((r) => r.request().method() === 'POST'),
			page.getByRole('button', { name: 'Continue →' }).click()
		]);

		expect(response.status()).toBe(400);
		await expect(page).toHaveURL(/\/language/);
		await expect(page.getByRole('alert')).toHaveText('Choose a Language to continue.');
		for (const radio of await page.getByRole('radio').all()) {
			await expect(radio).toHaveAttribute('aria-invalid', 'true');
			await expect(radio).not.toBeChecked();
		}
	} finally {
		await context.close();
	}
});

test('choosing Go lands on the next Problem, which builds in Go', async ({ browser, baseURL }) => {
	const { context, page } = await openAs(browser, baseURL, false);
	try {
		await page.goto('/language?next=/problems/stacks-push');
		await page.getByRole('radio', { name: 'Go' }).check();
		await page.getByRole('button', { name: 'Continue →' }).click();

		await expect(page).toHaveURL(/\/problems\/stacks-push$/);
		await expect(page.getByLabel('build language')).toHaveValue('go');
	} finally {
		await context.close();
	}
});

test('with JavaScript on, nothing chosen keeps focus on the first radio', async ({
	browser,
	baseURL
}) => {
	const { context, page } = await openAs(browser, baseURL, true);
	try {
		await gotoHydrated(page, '/language?next=/problems/stacks-push');
		await page.getByRole('button', { name: 'Continue →' }).click();

		await expect(page.getByRole('alert')).toHaveText('Choose a Language to continue.');
		await expect(page.getByRole('radio', { name: 'Python' })).toBeFocused();
	} finally {
		await context.close();
	}
});
