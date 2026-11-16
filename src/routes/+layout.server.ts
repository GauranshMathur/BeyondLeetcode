import { headerFor } from '#lib/server/header.js';
import type { LayoutServerLoad } from './$types';

// No identity before the Instance is set up: only /setup renders then, and it shows no name.
// The devMode key is present only when dev mode is on, so an Instance without it sends no trace of it.
export const load: LayoutServerLoad = ({ locals, route, url }) => ({
	header: headerFor({
		identity: locals.identity,
		mode: locals.instance.mode(),
		routeId: route.id,
		pathname: url.pathname
	}),
	...(locals.devMode ? { devMode: true as const } : {})
});
