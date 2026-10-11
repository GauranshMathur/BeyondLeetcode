import { expect, test } from '@playwright/test';

// This file acts as its own Learner, so it never depends on another file's leftovers.
test.use({ extraHTTPHeaders: { 'x-test-learner': 'e2e-fonts' } });

test('no page requests a web font', async ({ page }) => {
	const requests: string[] = [];
	page.on('request', (request) => requests.push(request.url()));

	for (const path of ['/', '/topics/stacks', '/chapters/stacks-undo-log', '/problems/stacks-pop']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
	}

	expect(requests.filter((url) => /fonts\.(googleapis|gstatic)\.com/.test(url))).toEqual([]);
});
