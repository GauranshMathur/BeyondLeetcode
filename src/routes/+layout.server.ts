import { headerFor } from '#lib/server/header.js';
import type { LayoutServerLoad } from './$types';

// No identity before the Instance is set up: only /setup renders then, and it shows no name.
export const load: LayoutServerLoad = ({ locals, route, url }) => ({
	header: headerFor({
		identity: locals.identity,
		mode: locals.instance.mode(),
		routeId: route.id,
		pathname: url.pathname
	})
});
