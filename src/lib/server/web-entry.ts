import http from 'node:http';
import { pinEnvironment, pinRequest } from './origin-pin.ts';

// The web role's entry (the image and the e2e servers start this, not build/index.js). It keeps everything
// adapter-node does (listening, ADDRESS_HEADER, XFF_DEPTH, BODY_SIZE_LIMIT, static files, graceful shutdown) by
// importing its own entry, and only pins the origin first; see ./origin-pin.ts.
const pin = pinEnvironment(process.env);

if (pin) {
	const createServer = http.createServer;
	http.createServer = ((...args: Parameters<typeof createServer>) => {
		const server = createServer(...args);
		// Before the adapter's own listener, so it never sees a client's copy of the private headers.
		server.prependListener('request', (req) => pinRequest(req, pin));
		return server;
	}) as typeof http.createServer;
}

// By URL, not a literal: the build exists only after `vite build`, so the type check must not look for it.
await import(new URL('../../../build/index.js', import.meta.url).href);
