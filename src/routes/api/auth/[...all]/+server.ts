import { error } from '@sveltejs/kit';
import { handleAuthRequest } from '#lib/server/identity/auth-handler.js';
import type { RequestHandler } from './$types';

/**
 * Better Auth's HTTP endpoints. A route, not a path check in the hook, so the gate judges it by route
 * id like every page: 404 in Local Mode, Setup before the Instance is set up, public in Multi-user.
 * The hook sets `locals.multiUser` only in Multi-user Mode; its `auth` goes to Identity's handler untouched.
 */
const handler: RequestHandler = ({ request, locals, getClientAddress }) => {
	if (!locals.multiUser) error(404, 'Not found');
	return handleAuthRequest(locals.multiUser.auth, request, getClientAddress());
};

export const GET = handler;
export const POST = handler;
