import { expect, test } from '@playwright/test';
import { asLearner } from '../../lib/e2e-learner.ts';
import { expectNoSidewaysScroll, phone } from '../../lib/e2e-phone.ts';
import { renderMarkdown } from '../../lib/server/markdown.ts';
import { gotoHydrated } from '../../lib/test/hydrated.ts';

// C174: a code block or a table in a statement or a Solution scrolls sideways inside its own box on a phone, never
// the page. The fixture Problems carry neither, so a code block and a table built by
// renderMarkdown are added to the prose; the rest is the real page.
// Not tagged @mobile: it is a layout check of the Problem's prose, run with the default project at the phone size.
test.use({ storageState: asLearner('e2e-prose'), ...phone });

const longLine = `bisect.insort(self.scores, (score, player))${'  # O(n) shift'.repeat(8)}`;
const table = [
	'| operation | sorted array | balanced BST | skip list |',
	'| --- | --- | --- | --- |',
	'| update_with_an_unbreakable_label_that_forces_the_table_wider_than_a_phone | O(n) | O(log n) | O(log n) expected |'
].join('\n');
const extra = renderMarkdown(`\`\`\`python\n${longLine}\n\`\`\`\n\n${table}\n`);

for (const [pane, path] of [
	['statement', '/problems/stacks-push'],
	['Solution', '/problems/stacks-push?tab=solution']
] as const) {
	test(`code and tables in the ${pane} scroll inside their own box, never the page`, async ({
		page
	}) => {
		await gotoHydrated(page, path);
		// Added after hydration, which re-sets the prose from the page data and would drop it from the document.
		await page
			.locator('.prose')
			.first()
			.evaluate((el, html) => el.insertAdjacentHTML('afterbegin', html), extra);
		const code = page.getByRole('group', { name: 'Code block' });
		const box = page.getByRole('group', { name: 'Table' });
		for (const el of [code, box]) {
			await expect(el).toHaveAttribute('tabindex', '0');
			const sizes = await el.evaluate((n) => ({ scroll: n.scrollWidth, client: n.clientWidth }));
			expect(sizes.scroll).toBeGreaterThan(sizes.client);
			await el.evaluate((n) => {
				n.scrollLeft = 200;
			});
			expect(await el.evaluate((n) => n.scrollLeft)).toBeGreaterThan(0);
		}
		await expectNoSidewaysScroll(page);
		expect(await page.evaluate(() => window.scrollX)).toBe(0);
	});
}
