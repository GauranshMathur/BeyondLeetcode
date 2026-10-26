import { spawnSync } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { HOST_HEADER, PROTOCOL_HEADER, pinEnvironment, pinFor, pinRequest } from './origin-pin.ts';

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
