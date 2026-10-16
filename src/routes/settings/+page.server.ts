import { error, fail, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { forwardSetCookies } from '$lib/server/identity/auth-handler';
import { parseTheme, THEME_COOKIE } from '$lib/theme';
import type { Actions, PageServerLoad } from './$types';

const ONE_YEAR = 60 * 60 * 24 * 365;

export const load: PageServerLoad = ({ cookies, url, locals }) => ({
	theme: parseTheme(cookies.get(THEME_COOKIE)),
	// Only a Multi-user Instance has sessions to end, so only it shows Sign out.
	multiUser: locals.instance.mode() === 'multi',
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
	/**
	 * Sign out: ends this session in the database, clears its cookies and goes to Sign in. A POST form
	 * action, never a GET, so a link or an image on another page cannot sign anyone out. The nav posts
	 * here too (`/settings?/signout`), and the gate lets it through for a user who must change their password.
	 */
	signout: async ({ request, locals, cookies }) => {
		// Local Mode has no accounts, so nothing to sign out of (the same 404 as its other Multi-user pages).
		const { auth } = locals;
		if (!auth) error(404, 'Not found');
		try {
			const { headers } = await auth.api.signOut({ headers: request.headers, returnHeaders: true });
			forwardSetCookies(cookies, headers.getSetCookie());
		} catch (failure) {
			// Only the kind of failure is logged: the error text may hold paths and query text.
			const code = isAPIError(failure) ? failure.body?.code : (failure as { code?: unknown })?.code;
			console.error(
				'Sign out failed:',
				failure instanceof Error ? failure.name : typeof failure,
				typeof code === 'string' ? code : undefined
			);
			return fail(500, { signOut: 'Signing out failed. Try again.' });
		}
		redirect(303, '/signin');
	},
	/** The confirmed reset: deletes the Learner's progress (the theme cookie stays) and shows the Map. */
	reset: async ({ locals }) => {
		await locals.learning.resetProgress();
		redirect(303, '/');
	}
};
