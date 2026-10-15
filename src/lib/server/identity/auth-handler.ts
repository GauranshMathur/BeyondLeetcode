import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';
import { type Auth, CLIENT_IP_HEADER } from './auth.ts';

/**
 * Runs a request through Better Auth's handler. The private client-address header is overwritten
 * with `clientAddress` (SvelteKit's `getClientAddress()`), never taken from the client, so the rate
 * limiter's bucket is the real caller's and a forged `X-Forwarded-For` or copy of the header is ignored.
 */
export async function handleAuthRequest(
	auth: Auth,
	request: Request,
	clientAddress: string
): Promise<Response> {
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
