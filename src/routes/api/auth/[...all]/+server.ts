import { error } from '@sveltejs/kit';
import { clientAddress } from '#lib/server/identity/client-address.js';
import type { RequestHandler } from './$types';

/**
 * Better Auth's HTTP endpoints. A route, not a path check in the hook, so the gate judges it by route
 * id like every page: 404 in Local Mode, Setup before the Instance is set up, public in Multi-user.
 * The hook sets `locals.multiUser` only in Multi-user Mode; the request goes to its bound handler,
 * which is given the address SvelteKit resolved ('' when it cannot tell).
 */
const handler: RequestHandler = (event) => {
	if (!event.locals.multiUser) error(404, 'Not found');
	return event.locals.multiUser.handleAuth(event.request, clientAddress(event));
};

export const GET = handler;
export const POST = handler;
