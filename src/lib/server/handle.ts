import type { Handle } from '@sveltejs/kit';
import { parseTheme, THEME_COOKIE, withTheme } from '$lib/theme';
import type { App } from './app.ts';
import { gate } from './identity/gate.ts';
import type { Identity } from './identity/index.ts';

/** Static files and SvelteKit's own endpoints are not pages: the gate never sees them. */
function isAsset(pathname: string): boolean {
	return pathname.startsWith('/_app/') || pathname === '/favicon.ico' || pathname === '/robots.txt';
}

/**
 * Per request: skip assets, read the Instance mode, resolve Identity only once the mode is Local,
 * let the gate decide, then render. Every response, refusals included, refuses framing.
 */
export function createHandle(app: Pick<App, 'core' | 'identity' | 'instance'>): Handle {
	return async ({ event, resolve }) => {
		const { url, request } = event;
		if (isAsset(url.pathname)) return refuseFraming(await resolve(event));

		event.locals.instance = app.instance;
		const mode = app.instance.mode();
		// Before Setup nobody is resolved, so no Local Learner is made. Multi-user has no adapter yet: nobody.
		let who: Identity | null = null;
		if (mode === 'local') who = await app.identity.resolve(event);

		const verdict = gate({
			mode,
			who,
			routeId: event.route.id,
			method: request.method,
			pathname: url.pathname,
			search: url.search
		});
		if (verdict.kind === 'redirect') {
			return refuseFraming(
				new Response(null, { status: verdict.status, headers: { location: verdict.location } })
			);
		}
		if (verdict.kind === 'status') {
			return refuseFraming(
				new Response(verdict.status === 403 ? 'Forbidden' : 'Not found', { status: verdict.status })
			);
		}

		// Unset only on /setup before the Instance is set up; the gate lets no other page through then.
		if (who) {
			event.locals.identity = who;
			event.locals.learning = app.core.forLearner(who.learnerId);
		}
		// No theme cookie means follow the device; a choice goes on <html> in the server render, so no flash.
		// Read when the page renders, not before: an action that just set the cookie is seen by its own response.
		return refuseFraming(
			await resolve(event, {
				transformPageChunk: ({ html }) =>
					withTheme(html, parseTheme(event.cookies.get(THEME_COOKIE)))
			})
		);
	};
}

/** Reset progress is destructive: no other site may frame the app and trick a click (clickjacking). */
function refuseFraming(response: Response): Response {
	response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
	response.headers.set('X-Frame-Options', 'DENY');
	return response;
}
