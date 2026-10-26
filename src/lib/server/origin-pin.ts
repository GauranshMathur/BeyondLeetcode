import type { IncomingMessage } from 'node:http';
import { parseOrigin } from './identity/origin.ts';

/**
 * adapter-node 6 no longer reads a runtime ORIGIN: it builds each request's URL from the Host header and a
 * protocol that defaults to https. This pins it again. The two header names below are private to this process:
 * the adapter is told to read the protocol and host from them (see `pinEnvironment`), and every request has
 * them set from ORIGIN after any copy a client sent is deleted. SvelteKit then sees exactly the origin the
 * operator named, so a form posted from any other origin is refused as cross-site, and a plain-http Instance
 * works as it did before.
 */
export const PROTOCOL_HEADER = 'x-bl-origin-proto';
export const HOST_HEADER = 'x-bl-origin-host';

export interface Pin {
	protocol: string;
	host: string;
}

/**
 * The pin ORIGIN asks for, or null when ORIGIN is unset (the adapter then derives the origin from the operator's
 * own PROTOCOL_HEADER and HOST_HEADER, as before). An ORIGIN that is empty or not an http(s) URL stops the start,
 * as adapter-node 5 did: the image's entrypoint unsets an empty one, so only a hand-run server meets it.
 */
export function pinFor(origin: string | undefined): Pin | null {
	if (origin === undefined) return null;
	const parsed = parseOrigin(origin);
	if (!parsed) {
		throw new Error(
			'ORIGIN must be the public URL of this Instance, for example https://learn.example.com. Fix it in your .env, or remove it, then restart.'
		);
	}
	const url = new URL(parsed);
	return { protocol: url.protocol.slice(0, -1), host: url.host };
}

/** Points adapter-node at the private headers. Must run before the adapter is imported: it reads these at import. */
export function pinEnvironment(env: NodeJS.ProcessEnv): Pin | null {
	const pin = pinFor(env.ORIGIN);
	if (!pin) return null;
	env.PROTOCOL_HEADER = PROTOCOL_HEADER;
	env.HOST_HEADER = HOST_HEADER;
	// ORIGIN carries its own port.
	delete env.PORT_HEADER;
	return pin;
}

const ABSOLUTE_FORM = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i;

/**
 * The request target as a path and query only. The adapter builds the URL as `origin + req.url`, so an
 * absolute-form target (`GET http://evil.example/x HTTP/1.1`, which HTTP allows) would turn ORIGIN
 * `https://learn.example.com` into `https://learn.example.comhttp://...`. An ordinary target, which starts with
 * `/`, is returned untouched; otherwise the scheme and authority are dropped, and leading slashes collapse to one
 * so the result is never protocol-relative (`//evil.example/x`).
 */
export function originForm(target: string): string {
	if (target.startsWith('/')) return target;
	const rest = target.replace(ABSOLUTE_FORM, '');
	return `/${rest.replace(/^\/+/, '')}`;
}

/**
 * Per request: drops whatever the client sent under the private names and sets them from the pin, and puts the
 * request target in origin form. Both must run before the adapter's own listener.
 */
export function pinRequest(req: Pick<IncomingMessage, 'headers' | 'url'>, pin: Pin): void {
	req.headers[PROTOCOL_HEADER] = pin.protocol;
	req.headers[HOST_HEADER] = pin.host;
	// Assigned only when it changes: an ordinary request is left exactly as it arrived.
	if (req.url !== undefined && !req.url.startsWith('/')) req.url = originForm(req.url);
}
