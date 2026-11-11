import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';
import { type Auth, CLIENT_IP_HEADER } from './auth.ts';

/** Where Better Auth's endpoints are mounted (its default `basePath`; the route is `/api/auth/[...all]`). */
const AUTH_BASE_PATH = '/api/auth';

/**
 * The only Better Auth endpoints served over HTTP, as paths under `AUTH_BASE_PATH`:
 * - `/callback/:id`, where an OAuth provider sends the browser back;
 * - `/sign-up/email`, which stays until the form replaces it.
 * Signing out is not here: the Settings page's `signout` action ends the session server-side.
 * Every other path answers 404 before it reaches Better Auth, so an endpoint a Better Auth upgrade adds
 * is not served until it is listed here. `disabledPaths` in `createAuth` stays as a second layer.
 */
const SERVED_PATHS: readonly RegExp[] = [/^\/callback\/[A-Za-z0-9_-]+$/, /^\/sign-up\/email$/];

function isServedAuthPath(pathname: string): boolean {
	if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) return false;
	const path = pathname.slice(AUTH_BASE_PATH.length);
	return SERVED_PATHS.some((served) => served.test(path));
}

/**
 * Runs a request through Better Auth's handler, if its path is on the allowlist (`SERVED_PATHS`).
 * The private client-address header is overwritten with `clientAddress` (SvelteKit's
 * `getClientAddress()`), never taken from the client, so the rate limiter's bucket is the real caller's
 * and a forged `X-Forwarded-For` or copy of the header is ignored.
 */
export async function handleAuthRequest(
	auth: Auth,
	request: Request,
	clientAddress: string
): Promise<Response> {
	if (!isServedAuthPath(new URL(request.url).pathname)) {
		return new Response('Not found', { status: 404 });
	}
	const headers = new Headers(request.headers);
	headers.set(CLIENT_IP_HEADER, clientAddress);
	const response = await auth.handler(new Request(request, { headers }));
	// A fresh Response: its headers can be added to (the hook adds the anti-framing ones).
	return new Response(response.body, response);
}

/** The part of SvelteKit's `cookies` that `forwardSetCookies` uses. */
export interface CookieJar {
	set(
		name: string,
		value: string,
		options: {
			path: string;
			maxAge?: number;
			expires?: Date;
			domain?: string;
			httpOnly: boolean;
			secure: boolean;
			sameSite?: 'lax' | 'strict' | 'none';
			partitioned?: boolean;
		}
	): void;
}

/**
 * Sets cookies Better Auth returned (`Set-Cookie` header values) on the SvelteKit response, with
 * the attributes it chose. `secure` is stated outright: SvelteKit would default it to true on any
 * host but localhost, and a Secure cookie is dropped over plain http. Values are never logged.
 */
export function forwardSetCookies(cookies: CookieJar, setCookies: string[]): void {
	for (const header of setCookies) {
		for (const [name, attributes] of parseSetCookieHeader(header)) {
			const { maxAge, expires, domain, sameSite, partitioned } = toCookieOptions(attributes);
			cookies.set(name, attributes.value, {
				path: attributes.path || '/',
				maxAge,
				expires,
				domain,
				sameSite: sameSite as 'lax' | 'strict' | 'none' | undefined,
				partitioned,
				httpOnly: attributes.httponly === true,
				secure: attributes.secure === true
			});
		}
	}
}
