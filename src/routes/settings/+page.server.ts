import { fail, redirect } from '@sveltejs/kit';
import { parseTheme, THEME_COOKIE } from '$lib/theme';
import type { Actions, PageServerLoad } from './$types';

const ONE_YEAR = 60 * 60 * 24 * 365;

export const load: PageServerLoad = ({ cookies, url }) => ({
	theme: parseTheme(cookies.get(THEME_COOKIE)),
	// "Reset progress" is a plain GET that opens the confirm, so it works without JavaScript.
	confirmingReset: url.searchParams.get('reset') === 'confirm'
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
	},
	/** The confirmed reset: deletes the Learner's progress (the theme cookie stays) and shows the Map. */
	reset: async ({ locals }) => {
		await locals.learning.resetProgress();
		redirect(303, '/');
	}
};
