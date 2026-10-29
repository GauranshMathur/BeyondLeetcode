import type { InstanceMode } from '../instance.ts';
import type { Identity } from './index.ts';
import { policyOf } from './route-policy.ts';

export interface GateInput {
	/** The stored Instance mode; null when the Instance is not set up. */
	mode: InstanceMode | null;
	/** Who the request is; null means nobody. */
	who: Identity | null;
	/** Set when the signed-in user must set a new password before anything else. */
	mustChangePassword?: boolean;
	/** SvelteKit's `event.route.id`; null when no route matched. */
	routeId: string | null;
	/**
	 * SvelteKit's `event.isDataRequest`: the request is for a page's load data (`.../__data.json`). By the time
	 * `handle` runs SvelteKit has already cut that suffix off `event.url.pathname` and set this flag instead
	 * (kit 2.70.3, `src/runtime/server/respond.js`: `has_data_suffix` sets `is_data_request`, `strip_data_suffix`
	 * rewrites `url.pathname`, the event gets `isDataRequest`), so the pathname cannot tell. `render_data` runs
	 * whatever the method, and never runs an action.
	 */
	isDataRequest: boolean;
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

const isPublic = (routeId: string) => policyOf(routeId).audience === 'public';
const isMultiOnly = (routeId: string) => policyOf(routeId).multiOnly;

/** The form action a POST runs, read the way SvelteKit reads it: the first query key that starts with '/'. */
const formAction = (search: string): string | null => {
	for (const key of new URLSearchParams(search).keys()) if (key.startsWith('/')) return key;
	return null;
};

/**
 * The two ways to sign out: Better Auth's own endpoint, and the Settings page's `signout` form action.
 * Never as a data request: that answers with the layout's and the page's load data, which a user who
 * must change their password has no business reading.
 */
const isSigningOut = ({ routeId, method, pathname, search, isDataRequest }: GateInput) =>
	method === 'POST' &&
	!isDataRequest &&
	(pathname === '/api/auth/sign-out' ||
		(routeId === '/settings' && formAction(search) === '/signout'));

/**
 * Decides what a request may do, first matching rule wins. Pure: the caller skips static assets
 * and SvelteKit internals (`/_app/`, favicon) and acts on the result.
 *
 * A path with no route (`routeId` null) is a private page in Multi-user Mode, so the 404 page does
 * not tell a signed-out visitor which paths exist; in Local Mode it is the 404 page for everyone.
 */
export function gate(input: GateInput): GateResult {
	const { mode, who, routeId, pathname, search } = input;

	if (mode === null) return routeId === '/setup' ? pass : redirect('/setup');

	if (routeId === '/setup') {
		const converting = mode === 'local' && new URLSearchParams(search).has('convert');
		return converting ? pass : redirect('/');
	}

	if (mode === 'local') return routeId !== null && isMultiOnly(routeId) ? status(404) : pass;

	if (who === null) {
		return routeId !== null && isPublic(routeId)
			? pass
			: redirect(`/signin?next=${encodeURIComponent(pathname + search)}`);
	}

	if (input.mustChangePassword) {
		const atPasswordPage = routeId === '/account/password';
		if (!atPasswordPage && !isSigningOut(input)) return redirect('/account/password');
	}

	if (policyOf(routeId).audience === 'admin' && who.role !== 'admin') return status(403);

	return pass;
}

/**
 * Whether a redirect target is, or normalizes to, a path starting with `//` or `/\\`, which a browser or a later
 * step would take for another site. Dot segments are resolved first (`/.//evil.com` is `//evil.com`). The one rule
 * for a safe redirect: `safeNext` and the provider callback's rewrite (`account-creation.ts`) both use it.
 */
export function isProtocolRelative(target: string): boolean {
	if (/^\/[/\\]/.test(target)) return true;
	try {
		return /^\/[/\\]/.test(new URL(target, 'http://placeholder.invalid').pathname);
	} catch {
		return true;
	}
}

/** A `next` value is followed only when it is a same-origin path, otherwise home. */
export function safeNext(next: string | null): string {
	if (next === null || !/^\/(?![/\\])/.test(next)) return '/';
	// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this rejects
	if (/[\u0000-\u001f\u007f]/.test(next)) return '/';
	// Dot segments (`/.//evil.com`) are covered by the shared rule.
	return isProtocolRelative(next) ? '/' : next;
}
