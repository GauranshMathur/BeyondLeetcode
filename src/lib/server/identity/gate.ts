import type { InstanceMode } from '../instance.ts';
import type { Identity } from './index.ts';

export interface GateInput {
	/** The stored Instance mode; null when the Instance is not set up. */
	mode: InstanceMode | null;
	/** Who the request is; null means nobody. */
	who: Identity | null;
	/** Set when the signed-in user must set a new password before anything else. */
	mustChangePassword?: boolean;
	/** SvelteKit's `event.route.id`; null when no route matched. */
	routeId: string | null;
	method: string;
	pathname: string;
	search: string;
}

export type GateResult =
	| { kind: 'pass' }
	| { kind: 'redirect'; status: 303; location: string }
	| { kind: 'status'; status: 403 | 404 };

const pass: GateResult = { kind: 'pass' };
const redirect = (location: string): GateResult => ({ kind: 'redirect', status: 303, location });
const status = (code: 403 | 404): GateResult => ({ kind: 'status', status: code });

const isUnder = (routeId: string, base: string) =>
	routeId === base || routeId.startsWith(`${base}/`);

const isAuthApi = (routeId: string) => routeId.startsWith('/api/auth/');
const isPublic = (routeId: string) =>
	routeId === '/signin' ||
	routeId === '/signup' ||
	routeId.startsWith('/invite/') ||
	isAuthApi(routeId);
const isMultiOnly = (routeId: string) =>
	isPublic(routeId) || isUnder(routeId, '/users') || routeId === '/account/password';

/**
 * Decides what a request may do, first matching rule wins. Pure: the caller skips static assets
 * and SvelteKit internals (`/_app/`, favicon) and acts on the result.
 */
export function gate(input: GateInput): GateResult {
	const { mode, who, routeId, method, pathname, search } = input;

	if (mode === null) return routeId === '/setup' ? pass : redirect('/setup');
	if (routeId === null) return pass;

	if (routeId === '/setup') {
		const converting = mode === 'local' && new URLSearchParams(search).has('convert');
		return converting ? pass : redirect('/');
	}

	if (mode === 'local') return isMultiOnly(routeId) ? status(404) : pass;

	if (who === null) {
		return isPublic(routeId)
			? pass
			: redirect(`/signin?next=${encodeURIComponent(pathname + search)}`);
	}

	if (input.mustChangePassword) {
		const signingOut = method === 'POST' && pathname === '/api/auth/sign-out';
		if (routeId !== '/account/password' && !signingOut) return redirect('/account/password');
	}

	if (isUnder(routeId, '/users') && who.role !== 'admin') return status(403);

	return pass;
}

/** A `next` value is followed only when it is a same-origin path, otherwise home. */
export function safeNext(next: string | null): string {
	if (next === null || !/^\/(?![/\\])/.test(next)) return '/';
	// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this rejects
	if (/[\u0000-\u001f\u007f]/.test(next)) return '/';
	return next;
}
