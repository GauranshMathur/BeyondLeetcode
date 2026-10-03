import { expect, test } from '@playwright/test';

test('no page requests a web font', async ({ page }) => {
	const requests: string[] = [];
	page.on('request', (request) => requests.push(request.url()));

	for (const path of ['/', '/topics/stacks', '/chapters/stacks-undo-log', '/problems/stacks-pop']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
	}

	expect(requests.filter((url) => /fonts\.(googleapis|gstatic)\.com/.test(url))).toEqual([]);
});
