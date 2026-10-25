import { expect, test } from '@playwright/test';
import { asLearner } from '../lib/e2e-learner.ts';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ storageState: asLearner('e2e-page') });

test('the Map shows Unlocked and Locked Topics from the fixture content', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Every topic, in the order it builds.'
	);

	// Stacks has no Prerequisites, so it is Unlocked and links on to its Topic page.
	const stacks = page.getByRole('link', {
		name: 'Stacks, unlocked, 0 of 2 core problems solved'
	});
	await expect(stacks).toHaveAttribute('href', '/topics/stacks');

	// Queues and Heaps wait on Prerequisites: Locked, and not links.
	await expect(page.getByRole('img', { name: /^Queues, locked/ })).toBeVisible();
	await expect(page.getByRole('img', { name: /^Heaps, locked/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Queues/ })).toHaveCount(0);

	await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText('Local');
	await expect(page.getByRole('link', { name: 'Map', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('an Unlocked Topic can be reached with the keyboard', async ({ page }) => {
	await page.goto('/');
	const stacks = page.getByRole('link', { name: /^Stacks, unlocked/ });
	await stacks.focus();
	await expect(stacks).toBeFocused();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('the Map is one column of Topics in build order, each with its state and its prerequisites', async ({
		page
	}) => {
		await page.goto('/');
		const topics = page.getByRole('list', { name: 'Topics in build order' }).getByRole('listitem');
		await expect(topics).toHaveCount(3);

		// Stacks has no Prerequisites: a link, no "after" line. Queues and Heaps are Locked: not links.
		await expect(topics.nth(0)).toContainText('Stacks');
		await expect(topics.nth(0)).toContainText('0/2 solved');
		await expect(topics.nth(0)).not.toContainText('after');
		await expect(topics.nth(0).getByRole('link')).toHaveAttribute('href', '/topics/stacks');
		await expect(topics.nth(1)).toContainText('Queues');
		await expect(topics.nth(1)).toContainText('locked');
		await expect(topics.nth(1)).toContainText('after Stacks');
		await expect(topics.nth(1).getByRole('link')).toHaveCount(0);
		await expect(topics.nth(2)).toContainText('after Stacks, Queues');
		await expect(topics.nth(2).getByRole('link')).toHaveCount(0);

		// One column: every box has the same left edge and sits below the one before.
		const boxes = await topics.evaluateAll((els) =>
			els.map((el) => {
				const r = el.getBoundingClientRect();
				return { left: r.left, top: r.top, right: r.right };
			})
		);
		expect(new Set(boxes.map((b) => b.left)).size).toBe(1);
		expect(boxes[0].left).toBe(20);
		expect(boxes[0].right).toBe(370);
		expect(boxes[1].top).toBeGreaterThan(boxes[0].top);
		expect(boxes[2].top).toBeGreaterThan(boxes[1].top);

		// The graph drawing is not shown, and there is no search field (search is not in MVP1).
		await expect(page.getByRole('group', { name: 'Topic map' })).toBeHidden();
		await expect(page.getByRole('searchbox')).toHaveCount(0);
	});

	test('the Map does not scroll sideways and every link is at least 44 px tall', async ({
		page
	}) => {
		await page.goto('/');
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);

		const heights = await page
			.getByRole('link')
			.evaluateAll((els) =>
				els.filter((el) => el.checkVisibility()).map((el) => el.getBoundingClientRect().height)
			);
		expect(heights.length).toBeGreaterThan(0);
		for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
	});
	test('the Local header is the 56 px bar: BLC to the Map and one Settings link, nothing sideways', async ({
		page
	}) => {
		await page.goto('/');
		const header = page.locator('header');
		expect((await header.boundingBox())?.height).toBe(56); // the 56 px bar, rule included

		const nav = page.getByRole('navigation', { name: 'Primary' });
		await expect(page.getByRole('link', { name: 'BLC' })).toHaveAttribute('href', '/');
		await expect(nav.getByRole('link')).toHaveCount(1); // the Map link is hidden: BLC is the way there
		await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
		// On the Map no link is marked.
		await expect(nav.getByRole('link', { name: 'Settings' })).not.toHaveAttribute(
			'aria-current',
			/.*/
		);
		await expect(nav.getByRole('button', { name: 'Sign out' })).toBeHidden();

		for (const link of await header.getByRole('link').all()) {
			expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
		}
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);

		// On Settings the one link is marked.
		await nav.getByRole('link', { name: 'Settings' }).click();
		await expect(page).toHaveURL('/settings');
		await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});
});
