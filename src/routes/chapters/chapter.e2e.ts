import { expect, test } from '@playwright/test';
import { asLearner } from '../../lib/e2e-learner.ts';
import { gotoHydrated } from '../../lib/test/hydrated.ts';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ storageState: asLearner('e2e-chapter') });

test('reaching the end of a Chapter marks it Read on the Topic', async ({ page }) => {
	await gotoHydrated(page, '/topics/stacks');
	const chapterRow = page.locator('section.chapter', {
		has: page.getByRole('link', { name: 'An undo log' })
	});
	await expect(chapterRow).toContainText('not read');

	await page.getByRole('link', { name: 'An undo log' }).click();
	await expect(page).toHaveURL('/chapters/stacks-undo-log');
	await expect(page.getByRole('heading', { level: 1, name: 'An undo log' }).first()).toBeVisible();
	await expect(page.getByText('Placeholder fixture text')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Push and size' })).toHaveAttribute(
		'href',
		'/problems/stacks-push'
	);
	await expect(page.getByRole('link', { name: 'Next chapter →' }).first()).toHaveAttribute(
		'href',
		'/chapters/stacks-call-frames'
	);

	// The Read marker on the page updates without a reload.
	await page.locator('main').evaluate((el) => el.lastElementChild?.scrollIntoView());
	await expect(page.locator('aside').getByText('read', { exact: true })).toBeVisible();

	await page.getByRole('link', { name: '← Stacks' }).click();
	await expect(chapterRow).toContainText('read');
	await expect(chapterRow).not.toContainText('not read');
	await expect(page.getByLabel('Topic progress')).toContainText('1 of 2');
});

test('a Locked Topic Chapter returns 403 and an unknown Chapter 404', async ({ page }) => {
	expect((await page.goto('/chapters/queues-print-spooler'))?.status()).toBe(403);
	expect((await page.goto('/chapters/nope'))?.status()).toBe(404);
});

test('a Chapter links to a prefilled new GitHub issue in a new tab', async ({ page }) => {
	await gotoHydrated(page, '/chapters/stacks-undo-log');
	const link = page.getByRole('link', { name: /Report an issue/ });
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	const url = new URL((await link.getAttribute('href')) ?? '');
	expect(`${url.origin}${url.pathname}`).toBe(
		'https://github.com/GauranshMathur/BeyondLeetcode/issues/new'
	);
	expect(url.searchParams.get('title')).toBe('Chapter: An undo log (stacks-undo-log)');
	expect(url.searchParams.get('body')).toContain('Source that shows it');
});

// Reaching the end posts reach-end and then re-runs the load. That re-run must not cancel a click on a
// link that is already navigating: held here so the order is fixed (click first, reach-end answers
// while the Problem page is still loading), not left to timing.
test.describe('a link clicked while the Chapter is being marked Read', () => {
	test.use({ storageState: asLearner('e2e-chapter-click') });

	test('still navigates', async ({ page }) => {
		let releaseReachEnd = () => {};
		let releaseProblem = () => {};
		const reachEndHeld = new Promise<void>((resolve) => (releaseReachEnd = resolve));
		const problemHeld = new Promise<void>((resolve) => (releaseProblem = resolve));
		await page.route(/\/chapters\/stacks-undo-log\?\/reachEnd/, async (route) => {
			await reachEndHeld;
			await route.continue();
		});
		await page.route(/\/problems\/stacks-push\/__data\.json/, async (route) => {
			await problemHeld;
			await route.continue();
		});

		const reachEndPosted = page.waitForRequest(/\?\/reachEnd/);
		await gotoHydrated(page, '/chapters/stacks-undo-log');
		await reachEndPosted; // the page is hydrated and the end has been reached
		const problemLoading = page.waitForRequest(/stacks-push\/__data\.json/);
		await page.getByRole('link', { name: 'Push and size' }).click();
		await problemLoading;
		const reachEndDone = page.waitForResponse(/\?\/reachEnd/);
		releaseReachEnd();
		await reachEndDone;
		releaseProblem();
		await expect(page).toHaveURL('/problems/stacks-push');
	});
});

// C47: the Chapter below 768 px. The fixture Chapters carry no code, table or margin note, so the
// document is served with a code block and a table added to the body; the rest is the real page.
test.describe('the Chapter on a phone', () => {
	test.use({
		storageState: asLearner('e2e-chapter-mobile'),
		viewport: { width: 390, height: 844 }
	});

	const longLine = `bisect.insort(self.scores, (score, player))${'  # O(n) shift'.repeat(8)}`;
	const extra = `<pre><code>${longLine}</code></pre><table><thead><tr><th>operation</th><th>sorted array</th><th>balanced BST</th><th>skip list</th></tr></thead><tbody><tr><td>update with a long label to force width</td><td>O(n)</td><td>O(log n)</td><td>O(log n) expected</td></tr></tbody></table>`;

	test.beforeEach(async ({ page }) => {
		await page.route('**/chapters/stacks-undo-log', async (route) => {
			const response = await route.fetch();
			const body = (await response.text()).replace(
				'Not learner content.</p>',
				`Not learner content.</p>${extra}`
			);
			await route.fulfill({ response, body });
		});
	});

	test('code and tables scroll inside their own box, never the page', async ({ page }) => {
		await gotoHydrated(page, '/chapters/stacks-undo-log');
		const code = page.getByRole('group', { name: 'Code block' });
		await expect(code).toHaveAttribute('tabindex', '0');
		const table = page.getByRole('group', { name: 'Table' });
		await expect(table).toHaveAttribute('tabindex', '0');
		for (const box of [code, table]) {
			const sizes = await box.evaluate((el) => ({
				scroll: el.scrollWidth,
				client: el.clientWidth
			}));
			expect(sizes.scroll).toBeGreaterThan(sizes.client);
		}
		await code.evaluate((el) => {
			el.scrollLeft = 200;
		});
		expect(await code.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
		const page_ = await page.evaluate(() => ({
			scroll: document.documentElement.scrollWidth,
			client: document.documentElement.clientWidth,
			x: window.scrollX
		}));
		expect(page_.scroll).toBeLessThanOrEqual(page_.client);
		expect(page_.x).toBe(0);
	});

	test('rows and end links are at least 44 px tall, end links come last', async ({ page }) => {
		await gotoHydrated(page, '/chapters/stacks-undo-log');
		const row = page.getByRole('link', { name: 'Push and size' });
		const topic = page.getByRole('link', { name: '↑ Stacks' });
		const next = page.getByRole('link', { name: 'Next chapter →' });
		const report = page.getByRole('link', { name: /Report an issue/ });
		const boxes = [];
		for (const link of [row, topic, next, report]) {
			await expect(link).toBeVisible();
			boxes.push(await link.boundingBox());
		}
		const [rowBox, topicBox, nextBox, reportBox] = boxes;
		// The whole Problem row is the link: its bottom-right corner hits the link too.
		const problemTr = page.locator('tr', { has: row });
		await problemTr.scrollIntoViewIfNeeded();
		const problemRow = await problemTr.boundingBox();
		expect(problemRow?.height).toBeGreaterThanOrEqual(44);
		expect(problemRow?.width).toBeGreaterThan(300);
		const cornerHitsLink = await row.evaluate(
			(el, point) => document.elementFromPoint(point.x, point.y)?.closest('a') === el,
			{
				x: (problemRow?.x ?? 0) + (problemRow?.width ?? 0) - 4,
				y: (problemRow?.y ?? 0) + (problemRow?.height ?? 0) - 4
			}
		);
		expect(cornerHitsLink).toBe(true);
		expect(topicBox?.height).toBeGreaterThanOrEqual(44);
		expect(nextBox?.height).toBeGreaterThanOrEqual(44);
		expect(reportBox?.height).toBeGreaterThanOrEqual(44);
		// Problems, then the end links, then the report-an-issue line.
		expect(topicBox?.y).toBeGreaterThan((rowBox?.y ?? 0) + (rowBox?.height ?? 0));
		expect(reportBox?.y).toBeGreaterThan((nextBox?.y ?? 0) + (nextBox?.height ?? 0));
	});

	// Its own Learner: the other tests here reach the end of this Chapter on load, so it would already be Read.
	test.describe('at the end', () => {
		test.use({ storageState: asLearner('e2e-chapter-mobile-read') });

		test('scrolling to the end marks the Chapter Read', async ({ page }) => {
			const marked = page.waitForResponse(/\?\/reachEnd/);
			await gotoHydrated(page, '/chapters/stacks-undo-log');
			await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
			expect((await marked).ok()).toBe(true);
			await gotoHydrated(page, '/topics/stacks');
			const chapterRow = page.locator('section.chapter', {
				has: page.getByRole('link', { name: 'An undo log' })
			});
			await expect(chapterRow).toContainText('read');
			await expect(chapterRow).not.toContainText('not read');
		});
	});
});

// C51: tagged @mobile, so the "mobile" project also runs it at 390 x 844 (see playwright.config.ts).
test.describe('reading a Chapter on a phone, as a flow', () => {
	test.use({ storageState: asLearner('e2e-chapter-flow'), viewport: { width: 390, height: 844 } });

	test('opening a Chapter from its Topic and reading to the end marks it Read', {
		tag: '@mobile'
	}, async ({ page }) => {
		await gotoHydrated(page, '/topics/stacks');
		const chapterRow = page.locator('section.chapter', {
			has: page.getByRole('link', { name: 'An undo log' })
		});
		await expect(chapterRow).toContainText('not read');

		await page.getByRole('link', { name: 'An undo log' }).tap();
		await expect(page).toHaveURL('/chapters/stacks-undo-log');
		// Below 768 px the Chapter hides its read marker, so wait for the mark itself to be saved.
		const marked = page.waitForResponse(/\?\/reachEnd/);
		await page.locator('main').evaluate((el) => el.lastElementChild?.scrollIntoView());
		expect((await marked).ok()).toBe(true);

		await page.getByRole('link', { name: '↑ Stacks' }).tap();
		await expect(page).toHaveURL('/topics/stacks');
		await expect(chapterRow).toContainText('read');
		await expect(chapterRow).not.toContainText('not read');
	});
});
