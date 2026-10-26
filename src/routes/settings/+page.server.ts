import { error, fail, type RequestEvent, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { forwardSetCookies } from '#lib/server/identity/auth-handler.js';
import { signedIn } from '#lib/server/signed-in.js';
import { parseTheme, THEME_COOKIE } from '#lib/theme.js';
import { hasPassword } from '../account/password/change-password';
import type { Actions, PageServerLoad } from './$types';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Whether the signed-in Account has a password, so Settings offers "Change password" only to one that does
 * (a GitHub/Google-only Account has none). Unknown counts as yes: the page then shows the row, and the
 * change-password action itself answers truthfully.
 */
async function accountHasPassword({ locals, request }: Pick<RequestEvent, 'locals' | 'request'>) {
	const { auth } = locals;
	if (!auth || !request) return true;
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		return session ? await hasPassword(auth, session.user.id) : true;
	} catch {
		return true;
	}
}

export const load: PageServerLoad = async ({ cookies, url, locals, request }) => ({
	theme: parseTheme(cookies.get(THEME_COOKIE)),
	// Only a Multi-user Instance has sessions to end, so only it shows Sign out.
	multiUser: locals.instance.mode() === 'multi',
	hasPassword: await accountHasPassword({ locals, request }),
	// "Reset progress" is a plain GET that opens the confirm, so it works without JavaScript.
	confirmingReset: url.searchParams.get('reset') === 'confirm'
});

export const actions: Actions = {
	/** "light" or "dark" is remembered in a cookie; "system" (follow the device) clears it. */
	theme: async ({ request, cookies, url }) => {
		// `secure` is stated outright: SvelteKit would default it to true on any host but localhost, and the
		// browser drops a Secure cookie over plain http (a LAN address, a Tailscale name), set or clear alike.
		const secure = url.protocol === 'https:';
		const choice = (await request.formData()).get('theme');
		if (choice === 'system') {
			cookies.delete(THEME_COOKIE, { path: '/', secure });
			return { theme: null };
		}
		const theme = parseTheme(typeof choice === 'string' ? choice : undefined);
		if (!theme) return fail(400, { message: 'Choose light, dark or follow my device.' });
		cookies.set(THEME_COOKIE, theme, { path: '/', maxAge: ONE_YEAR, sameSite: 'lax', secure });
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
			// A user who must change their password is held to that page: a rendered Settings would be a page
			// they may not see. Whether they must is read afresh; if it cannot be read they are treated as held.
			let held = true;
			try {
				const session = await auth.api.getSession({ headers: request.headers });
				held =
					(session?.user as { mustChangePassword?: boolean | null } | undefined)
						?.mustChangePassword === true;
				if (!session) held = true;
			} catch {
				held = true;
			}
			if (held) redirect(303, '/account/password');
			return fail(500, { signOut: 'Signing out failed. Try again.' });
		}
		redirect(303, '/signin');
	},
	/** The confirmed reset: deletes the Learner's progress (the theme cookie stays) and shows the Map. */
	reset: async ({ locals }) => {
		await signedIn(locals).learning.resetProgress();
		redirect(303, '/');
	}
};
