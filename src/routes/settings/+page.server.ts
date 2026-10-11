import { fail } from '@sveltejs/kit';
import { parseTheme, THEME_COOKIE } from '$lib/theme';
import type { Actions, PageServerLoad } from './$types';

const ONE_YEAR = 60 * 60 * 24 * 365;

export const load: PageServerLoad = ({ cookies }) => ({
	theme: parseTheme(cookies.get(THEME_COOKIE))
});

export const actions: Actions = {
	/** "light" or "dark" is remembered in a cookie; "system" (follow the device) clears it. */
	theme: async ({ request, cookies }) => {
		const choice = (await request.formData()).get('theme');
		if (choice === 'system') {
			cookies.delete(THEME_COOKIE, { path: '/' });
			return { theme: null };
		}
		const theme = parseTheme(typeof choice === 'string' ? choice : undefined);
		if (!theme) return fail(400, { message: 'Choose light, dark or follow my device.' });
		cookies.set(THEME_COOKIE, theme, { path: '/', maxAge: ONE_YEAR, sameSite: 'lax' });
		return { theme };
	}
};
