import type { Handle } from '@sveltejs/kit';
import { parseTheme, THEME_COOKIE, withTheme } from '$lib/theme';
import type { App } from './app.ts';
import { gate } from './identity/gate.ts';
import type { Identity } from './identity/index.ts';

/**
 * Per request: refuse remote calls, read the Instance mode, resolve Identity only once the mode is Local,
 * let the gate decide, then render. Every response, refusals included, refuses framing.
 */
export function createHandle(app: Pick<App, 'core' | 'identity' | 'instance'>): Handle {
	return async ({ event, resolve }) => {
		const { url, request } = event;
		// Remote calls take their pathname and route from client headers, so the gate cannot judge them; none exist yet.
		// Static files never reach this hook (the server answers them first).
		if (event.isRemoteRequest) return refuseFraming(refusal(404));

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
				new Response(null, {
					status: verdict.status,
					headers: { location: verdict.location, 'Cache-Control': 'no-store' }
				})
			);
		}
		if (verdict.kind === 'status') {
			return refuseFraming(refusal(verdict.status));
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

/** A gate decision depends on the Instance state, so it is never cached. */
function refusal(status: 403 | 404): Response {
	return new Response(status === 403 ? 'Forbidden' : 'Not found', {
		status,
		headers: { 'Cache-Control': 'no-store' }
	});
}

/** Reset progress is destructive: no other site may frame the app and trick a click (clickjacking). */
function refuseFraming(response: Response): Response {
	response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
	response.headers.set('X-Frame-Options', 'DENY');
	return response;
}
