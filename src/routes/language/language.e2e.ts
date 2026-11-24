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

test('on a phone the button is as wide as the form', async ({ browser, baseURL }) => {
	const context = await browser.newContext({
		baseURL,
		storageState: newLearner(),
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	try {
		await page.goto('/language');
		const form = await page.locator('main form').boundingBox();
		const button = await page.getByRole('button', { name: 'Continue →' }).boundingBox();

		expect(form).not.toBeNull();
		expect(button?.width).toBeCloseTo(form?.width ?? -1, 0);
		expect(button?.height).toBeGreaterThanOrEqual(44);
	} finally {
		await context.close();
	}
});

test('with JavaScript off, a Problem sends a new Learner to the choice, and Go lands back on it', async ({
	browser,
	baseURL
}) => {
	const { context, page } = await openAs(browser, baseURL, false);
	try {
		await page.goto('/problems/stacks-push');

		await expect(page).toHaveURL(/\/language\?next=%2Fproblems%2Fstacks-push$/);
		for (const name of ['Python', 'TypeScript', 'Go']) {
			await expect(page.getByRole('radio', { name })).not.toBeChecked();
		}
		await page.getByRole('radio', { name: 'Go' }).check();
		await page.getByRole('button', { name: 'Continue →' }).click();

		await expect(page).toHaveURL(/\/problems\/stacks-push$/);
		await expect(page.getByLabel('build language')).toHaveValue('go');
	} finally {
		await context.close();
	}
});

test('with JavaScript on, the Problem link from a Topic leads to the choice and back in TypeScript', async ({
	browser,
	baseURL
}) => {
	const { context, page } = await openAs(browser, baseURL, true);
	try {
		await gotoHydrated(page, '/topics/stacks');
		await page.locator('a[href="/problems/stacks-push"]').first().click();

		await expect(page).toHaveURL(/\/language\?next=%2Fproblems%2Fstacks-push$/);
		await page.getByRole('radio', { name: 'TypeScript' }).check();
		await page.getByRole('button', { name: 'Continue →' }).click();

		await expect(page).toHaveURL(/\/problems\/stacks-push$/);
		await expect(page.getByLabel('build language')).toHaveValue('typescript');
	} finally {
		await context.close();
	}
});

test('a Learner with no starting Language can still open the Map and Settings', async ({
	browser,
	baseURL
}) => {
	const { context, page } = await openAs(browser, baseURL, false);
	try {
		expect((await page.goto('/'))?.status()).toBe(200);
		await expect(page).toHaveURL(/\/$/);
		expect((await page.goto('/settings'))?.status()).toBe(200);
		await expect(page).toHaveURL(/\/settings$/);
	} finally {
		await context.close();
	}
});
