import { expect, test } from '@playwright/test';

// The Local server (4173) runs the web entry with ORIGIN=http://localhost:4173 over plain http. SvelteKit's
// cross-site check runs before routing, so any form target shows it.
const target = '/settings?/theme';

test('a form posted from another origin is refused, whatever private header the client adds', async ({
	request
}) => {
	for (const headers of [
		{ origin: 'http://evil.example' },
		{
			origin: 'http://evil.example',
			'x-bl-origin-host': 'evil.example',
			'x-bl-origin-proto': 'http'
		},
		// The same host over https is another origin.
		{ origin: 'https://localhost:4173' }
	]) {
		const response = await request.post(target, {
			headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
			data: 'theme=dark',
			maxRedirects: 0
		});

		expect(response.status()).toBe(403);
	}
});

test('a form posted from ORIGIN over plain http is accepted', async ({ request }) => {
	const response = await request.post(target, {
		headers: {
			origin: 'http://localhost:4173',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: 'theme=dark',
		maxRedirects: 0
	});

	expect(response.status()).not.toBe(403);
});

test('a client that spoofs the private host header cannot make another origin the right one', async ({
	request
}) => {
	const response = await request.post(target, {
		headers: {
			origin: 'http://evil.example',
			host: 'evil.example',
			'x-bl-origin-host': 'evil.example',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: 'theme=dark',
		maxRedirects: 0
	});

	expect(response.status()).toBe(403);
});
