import { describe, expect, it, vi } from 'vitest';
import { THEME_COOKIE } from '$lib/theme';
import { actions, load } from './+page.server';

// SvelteKit marks a cookie Secure unless `secure` is stated, on any host but localhost, and a browser drops a
// Secure cookie it gets over plain http: an Instance on a LAN address or a Tailscale name would keep no theme.

async function choose(choice: string, address: string) {
	const cookies = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
	const result = await actions.theme({
		request: { formData: async () => new URLSearchParams({ theme: choice }) },
		cookies,
		url: new URL(`${address}/settings?/theme`)
	} as never);
	return { cookies, result };
}

describe.each([
	['plain http on a LAN address', 'http://192.168.1.20:3000', false],
	['plain http on a Tailscale name', 'http://learn.tail1234.ts.net', false],
	['http on localhost', 'http://localhost:3000', false],
	['https', 'https://learn.example.com', true]
])('the theme cookie over %s', (_name, address, secure) => {
	it.each(['dark', 'light'])('sets %s with secure: %s stated', async (choice) => {
		const { cookies } = await choose(choice, address);

		expect(cookies.set).toHaveBeenCalledWith(
			THEME_COOKIE,
			choice,
			expect.objectContaining({ path: '/', sameSite: 'lax', secure })
		);
	});

	it('clears it with the same secure flag', async () => {
		const { cookies } = await choose('system', address);

		expect(cookies.delete).toHaveBeenCalledWith(THEME_COOKIE, { path: '/', secure });
	});
});

describe('the Settings load offers "Change password" only to an Account that has a password', () => {
	const run = (credential: { password: string | null } | null) =>
		load({
			cookies: { get: () => undefined },
			url: new URL('http://localhost/settings'),
			request: { headers: new Headers() },
			locals: {
				instance: { mode: () => 'multi' },
				auth: {
					api: { getSession: async () => ({ user: { id: 'u1' } }) },
					$context: Promise.resolve({
						internalAdapter: { findCredentialAccount: async () => credential }
					})
				}
			}
		} as never);

	it('has one', async () => {
		expect(await run({ password: 'hash' })).toMatchObject({ hasPassword: true });
	});

	it('has none (GitHub or Google only)', async () => {
		expect(await run(null)).toMatchObject({ hasPassword: false });
		expect(await run({ password: null })).toMatchObject({ hasPassword: false });
	});
});
