import { spawnSync } from 'node:child_process';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
	HOST_HEADER,
	originForm,
	PROTOCOL_HEADER,
	pinEnvironment,
	pinFor,
	pinRequest
} from './origin-pin.ts';

describe('pinFor', () => {
	it('takes the protocol and host, port included, from ORIGIN', () => {
		expect(pinFor('http://localhost:4173')).toEqual({ protocol: 'http', host: 'localhost:4173' });
		expect(pinFor('https://learn.example.com/')).toEqual({
			protocol: 'https',
			host: 'learn.example.com'
		});
		expect(pinFor('https://learn.example.com:8443')).toEqual({
			protocol: 'https',
			host: 'learn.example.com:8443'
		});
	});

	it('is no pin when ORIGIN is unset: the operator headers decide, as before', () => {
		expect(pinFor(undefined)).toBeNull();
	});

	it.each(['', 'learn.example.com', 'ftp://learn.example.com', 'http://', 'nonsense'])(
		'refuses to start on %s',
		(origin) => {
			expect(() => pinFor(origin)).toThrow(/ORIGIN/);
		}
	);
});

describe('pinEnvironment', () => {
	it('points the adapter at the private headers and drops the operator PORT_HEADER', () => {
		const env: NodeJS.ProcessEnv = {
			ORIGIN: 'http://localhost:3000',
			PROTOCOL_HEADER: 'x-forwarded-proto',
			HOST_HEADER: 'x-forwarded-host',
			PORT_HEADER: 'x-forwarded-port',
			ADDRESS_HEADER: 'x-forwarded-for'
		};

		expect(pinEnvironment(env)).toEqual({ protocol: 'http', host: 'localhost:3000' });
		expect(env).toMatchObject({
			PROTOCOL_HEADER,
			HOST_HEADER,
			ADDRESS_HEADER: 'x-forwarded-for'
		});
		expect(env.PORT_HEADER).toBeUndefined();
	});

	it('leaves the operator headers alone with no ORIGIN', () => {
		const env: NodeJS.ProcessEnv = { PROTOCOL_HEADER: 'x-forwarded-proto' };

		expect(pinEnvironment(env)).toBeNull();
		expect(env.PROTOCOL_HEADER).toBe('x-forwarded-proto');
	});
});

describe('pinRequest on a real server', () => {
	let server: http.Server | undefined;
	afterEach(() => server?.close());

	it('overwrites a client copy of the private headers with the pin', async () => {
		server = http.createServer((req, res) => res.end(JSON.stringify(req.headers)));
		server.prependListener('request', (req) =>
			pinRequest(req, { protocol: 'https', host: 'learn.example.com' })
		);
		await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
		const { port } = server.address() as AddressInfo;

		const seen = await new Promise<Record<string, string>>((done, fail) => {
			http
				.get(
					{
						host: '127.0.0.1',
						port,
						headers: { [HOST_HEADER]: 'evil.example', [PROTOCOL_HEADER]: 'http' }
					},
					(res) => {
						let body = '';
						res.on('data', (chunk) => {
							body += chunk;
						});
						res.on('end', () => done(JSON.parse(body)));
					}
				)
				.on('error', fail);
		});

		expect(seen[HOST_HEADER]).toBe('learn.example.com');
		expect(seen[PROTOCOL_HEADER]).toBe('https');
	});
});

describe('originForm', () => {
	it.each([
		['/settings?/theme', '/settings?/theme'],
		['//evil.example/x', '//evil.example/x'],
		['/', '/'],
		['http://evil.example/settings', '/settings'],
		['https://evil.example:8443/a/b?c=d', '/a/b?c=d'],
		['http://evil.example', '/'],
		['http://evil.example?q=1', '/?q=1'],
		['http://evil.example//evil2.example/x', '/evil2.example/x'],
		['HTTP://EVIL.example///x', '/x'],
		['*', '/*']
	])('%s becomes %s', (target, expected) => {
		expect(originForm(target)).toBe(expected);
	});
});

/** A server behind `pinRequest`, and a raw client: the way a request target or header copy actually arrives. */
async function pinned(pin: { protocol: string; host: string }) {
	const server = http.createServer((req, res) => {
		// What the adapter does: the origin it is given, then the request target.
		const origin = `${req.headers[PROTOCOL_HEADER]}://${req.headers[HOST_HEADER]}`;
		const url = new URL(req.url ?? '', origin);
		res.end(
			JSON.stringify({
				origin: url.origin,
				pathname: url.pathname,
				search: url.search,
				proto: req.headers[PROTOCOL_HEADER],
				host: req.headers[HOST_HEADER]
			})
		);
	});
	server.prependListener('request', (req) => pinRequest(req, pin));
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const { port } = server.address() as AddressInfo;
	/** Sends `raw` and returns the JSON bodies of every response, in order. */
	const send = (raw: string, responses = 1) =>
		new Promise<Record<string, string>[]>((done, fail) => {
			const socket = net.connect(port, '127.0.0.1', () => socket.write(raw));
			let text = '';
			socket.on('data', (chunk) => {
				text += chunk;
				const bodies = [...text.matchAll(/\r\n\r\n(\{[^}]*\})/g)].map((m) => JSON.parse(m[1]));
				if (bodies.length >= responses) {
					socket.destroy();
					done(bodies);
				}
			});
			socket.on('error', fail);
		});
	return { send, close: () => server.close() };
}

describe('the pin on raw requests', () => {
	const open: Array<() => void> = [];
	afterEach(() => {
		for (const close of open.splice(0)) close();
	});
	const start = async (pin: { protocol: string; host: string }) => {
		const s = await pinned(pin);
		open.push(s.close);
		return s;
	};
	const get = (target: string, headers = '') =>
		`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n${headers}\r\n`;

	it.each([
		['https', 'learn.example.com'],
		['https', 'learn.example.com:8443'],
		['http', 'localhost:3000']
	])('an absolute-form target cannot change the origin of %s://%s', async (protocol, host) => {
		const { send } = await start({ protocol, host });

		const [seen] = await send(get('http://evil.example/settings?a=1'));

		expect(seen).toMatchObject({
			origin: `${protocol}://${host}`,
			pathname: '/settings',
			search: '?a=1'
		});
	});

	it('an absolute-form target never becomes a protocol-relative path', async () => {
		const { send } = await start({ protocol: 'https', host: 'learn.example.com' });

		const [seen] = await send(get('http://evil.example//other.example/x'));

		expect(seen).toMatchObject({
			origin: 'https://learn.example.com',
			pathname: '/other.example/x'
		});
	});

	it('an ordinary target is left as it is', async () => {
		const { send } = await start({ protocol: 'https', host: 'learn.example.com' });

		const [seen] = await send(get('/chapters/a?b=c'));

		expect(seen).toMatchObject({ pathname: '/chapters/a', search: '?b=c' });
	});

	it('overwrites duplicate, comma-joined and differently cased copies of the private headers', async () => {
		const { send } = await start({ protocol: 'https', host: 'learn.example.com' });
		const copies = [
			`${HOST_HEADER}: evil.example\r\n${HOST_HEADER}: evil2.example\r\n`,
			`${HOST_HEADER}: evil.example, evil2.example\r\n`,
			`X-BL-Origin-Host: evil.example\r\nX-Bl-Origin-Proto: http\r\n`
		];

		for (const headers of copies) {
			const [seen] = await send(get('/', headers));

			expect(seen).toMatchObject({
				proto: 'https',
				host: 'learn.example.com',
				origin: 'https://learn.example.com'
			});
		}
	});

	it('pins each of two pipelined requests on one connection', async () => {
		const { send } = await start({ protocol: 'https', host: 'learn.example.com' });

		const seen = await send(
			get('/a', `${HOST_HEADER}: evil.example\r\n`) +
				get('http://evil.example/b', `${PROTOCOL_HEADER}: http\r\n`),
			2
		);

		expect(seen).toHaveLength(2);
		expect(seen[0]).toMatchObject({ origin: 'https://learn.example.com', pathname: '/a' });
		expect(seen[1]).toMatchObject({ origin: 'https://learn.example.com', pathname: '/b' });
	});
});

describe('the web entry', () => {
	it('stops on an ORIGIN that is not an http(s) URL, before serving anything', () => {
		const entry = new URL('./web-entry.ts', import.meta.url).pathname;
		const run = spawnSync('bun', [entry], {
			env: { ...process.env, ORIGIN: 'learn.example.com', PORT: '0' },
			encoding: 'utf8',
			timeout: 20_000
		});

		expect(run.status).not.toBe(0);
		expect(run.stderr).toMatch(/ORIGIN must be the public URL/);
	});
});
