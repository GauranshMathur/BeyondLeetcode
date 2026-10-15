import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE, InitError, newToken, parseArgs, runInit, USAGE } from './init';

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'init-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const read = (name: string) => readFile(join(dir, name), 'utf8');
const envValue = (env: string, key: string) => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1];

describe('init', () => {
	it('writes compose.yaml and a .env with the origin, port, token and image', async () => {
		const out = await runInit(['--origin', 'https://learn.example.com/', '--port', '8080'], dir);
		const env = await read('.env');
		expect(envValue(env, 'ORIGIN')).toBe('https://learn.example.com');
		expect(envValue(env, 'PORT')).toBe('8080');
		expect(envValue(env, 'BEYONDLEETCODE_IMAGE')).toBe(DEFAULT_IMAGE);
		expect(envValue(env, 'RUNNER_TOKEN')).toMatch(/^[0-9a-f]{48}$/);
		expect(envValue(env, 'BETTER_AUTH_SECRET')).toMatch(/^[0-9a-f]{48}$/);
		expect(await read('compose.yaml')).toMatch(/image: \$\{BEYONDLEETCODE_IMAGE\}/);
		expect(out).toContain('docker compose up -d');
		expect(out).toContain('https://learn.example.com');
	});

	it('defaults the port to 3000 and uses the image it ran from when known', async () => {
		await runInit(['--origin', 'http://localhost:3000'], dir, 'ghcr.io/x/y:v1.2.3');
		const env = await read('.env');
		expect(envValue(env, 'PORT')).toBe('3000');
		expect(envValue(env, 'BEYONDLEETCODE_IMAGE')).toBe('ghcr.io/x/y:v1.2.3');
	});

	it('requires --origin', async () => {
		await expect(runInit([], dir)).rejects.toThrow(/--origin is required/);
		await expect(read('compose.yaml')).rejects.toThrow();
	});

	it('rejects a bad origin, port or option', () => {
		expect(() => parseArgs(['--origin', 'learn.example.com'])).toThrow(InitError);
		expect(() => parseArgs(['--origin', 'ftp://x.io'])).toThrow(InitError);
		expect(() => parseArgs(['--origin', 'http://a.io', '--port', '0'])).toThrow(InitError);
		expect(() => parseArgs(['--origin', 'http://a.io', '--bogus'])).toThrow(InitError);
		expect(() => parseArgs(['--origin'])).toThrow(InitError);
	});

	it('refuses to overwrite either file unless --force', async () => {
		await writeFile(join(dir, '.env'), 'KEEP=1\n', { mode: 0o644 });
		await expect(runInit(['--origin', 'http://a.io'], dir)).rejects.toThrow(/already exists/);
		expect(await read('.env')).toBe('KEEP=1\n');
		await expect(read('compose.yaml')).rejects.toThrow();

		await runInit(['--origin', 'http://a.io', '--force'], dir);
		expect(envValue(await read('.env'), 'ORIGIN')).toBe('http://a.io');
		expect((await stat(join(dir, '.env'))).mode & 0o777).toBe(0o600);
	});

	it('writes a different auth secret than the runner token, and a new one each run', async () => {
		await runInit(['--origin', 'http://a.io'], dir);
		const first = await read('.env');
		await runInit(['--origin', 'http://a.io', '--force'], dir);
		const second = await read('.env');
		expect(envValue(first, 'BETTER_AUTH_SECRET')).not.toBe(envValue(first, 'RUNNER_TOKEN'));
		expect(envValue(first, 'BETTER_AUTH_SECRET')).not.toBe(envValue(second, 'BETTER_AUTH_SECRET'));
	});

	it('generates a different token each time', () => {
		expect(newToken()).toHaveLength(48);
		expect(newToken()).not.toBe(newToken());
	});
});

describe('.env', () => {
	it('says Multi-user needs ORIGIN, and offers the proxy settings commented out', async () => {
		await runInit(['--origin', 'https://learn.example.com'], dir);
		const env = await read('.env');
		expect(env).toMatch(/Multi-user requires it/);
		// The old advice sent proxy users to the header block instead of ORIGIN.
		expect(env).not.toMatch(/instead\.?$/m);
		// Commented out: unset, clients that connect straight to the app need nothing.
		expect(env).toContain('# ADDRESS_HEADER=X-Forwarded-For');
		expect(env).toContain('# XFF_DEPTH=1');
		expect(envValue(env, 'ADDRESS_HEADER')).toBeUndefined();
		expect(envValue(env, 'XFF_DEPTH')).toBeUndefined();
	});

	it('tells proxy users to publish the port on the loopback address only', async () => {
		await runInit(['--origin', 'https://learn.example.com'], dir);
		// A client that goes round the proxy to the published port could forge ADDRESS_HEADER.
		expect(await read('.env')).toContain(`127.0.0.1:\${PORT}:3000`);
	});

	it('says the auth secret is read at start', async () => {
		await runInit(['--origin', 'https://learn.example.com'], dir);
		const env = await read('.env');
		expect(env).not.toMatch(/not read at start/i);
		expect(env).toMatch(/Read at start/);
	});

	it('tells an upgrading operator which lines their compose.yaml needs', () => {
		expect(USAGE).toContain(`ADDRESS_HEADER: \${ADDRESS_HEADER:-}`);
		expect(USAGE).toContain(`XFF_DEPTH: \${XFF_DEPTH:-1}`);
		expect(USAGE).toContain(`127.0.0.1:\${PORT}:3000`);
		// The old line passes an empty ORIGIN when .env has none, and that stops the server.
		expect(USAGE).toContain(`replace ORIGIN: \${ORIGIN:-} with a bare ORIGIN:`);
	});
});

describe('compose.yaml', () => {
	it('mounts the engine socket in the runner only, and keeps the runner off the outside network', async () => {
		await runInit(['--origin', 'http://a.io'], dir);
		const compose = await read('compose.yaml');
		const web = compose.slice(compose.indexOf('  web:'), compose.indexOf('  runner:'));
		const runner = compose.slice(compose.indexOf('  runner:'), compose.indexOf('networks:\n'));
		expect(compose.match(/docker\.sock/g)?.length).toBe(2); // the one volume line, source and target
		expect(web).not.toContain('docker.sock');
		expect(runner).toContain('/var/run/docker.sock:/var/run/docker.sock');
		expect(runner).not.toContain('ports:');
		expect(runner).toContain('networks: [internal]');
		expect(compose).toContain('internal: true');
		expect(compose).toContain('PROTOCOL_HEADER');
	});

	it('passes ORIGIN through and says Multi-user requires it', async () => {
		await runInit(['--origin', 'http://a.io'], dir);
		const compose = await read('compose.yaml');
		const web = compose.slice(compose.indexOf('  web:'), compose.indexOf('  runner:'));
		// Present as a bare key, so a removed ORIGIN line in .env leaves it unset in the container.
		expect(web).toMatch(/^ {6}ORIGIN:$/m);
		// Not defaulted to "": adapter-node 5.5 stops with "Invalid ORIGIN" on an empty value.
		expect(web).not.toMatch(/ORIGIN: \$\{ORIGIN:-/);
		expect(web).toMatch(/ORIGIN is required for Multi-user/);
		// The old advice told proxy users to leave it empty.
		expect(web).not.toMatch(/empty ORIGIN in \.env/i);
		// Local mode behind a proxy still has the header route.
		expect(web).toContain('# PROTOCOL_HEADER: x-forwarded-proto');
		expect(web).toContain('# HOST_HEADER: x-forwarded-host');
		expect(compose.slice(compose.indexOf('  runner:'))).not.toContain('ORIGIN');
	});

	it('passes the client-address settings to web, so a proxy does not put every client in one rate-limit bucket', async () => {
		await runInit(['--origin', 'http://a.io'], dir);
		const compose = await read('compose.yaml');
		const web = compose.slice(compose.indexOf('  web:'), compose.indexOf('  runner:'));
		expect(web).toContain(`ADDRESS_HEADER: \${ADDRESS_HEADER:-}`);
		// Never "": adapter-node parses XFF_DEPTH with parseInt, which turns an empty value into NaN.
		expect(web).toContain(`XFF_DEPTH: \${XFF_DEPTH:-1}`);
		expect(compose.slice(compose.indexOf('  runner:'))).not.toMatch(/ADDRESS_HEADER|XFF_DEPTH/);
	});

	it('keeps the default port binding, and says how to bind to the loopback address behind a proxy', async () => {
		await runInit(['--origin', 'http://a.io'], dir);
		const compose = await read('compose.yaml');
		const web = compose.slice(compose.indexOf('  web:'), compose.indexOf('  runner:'));
		// Local users reach the Instance over the LAN, so the default stays on every interface.
		expect(web).toContain(`      - "\${PORT}:3000"`);
		expect(web).not.toMatch(/^\s+- "127\.0\.0\.1/m);
		// The comment that follows names the alternative, for operators who set ADDRESS_HEADER.
		expect(web).toContain(`# - "127.0.0.1:\${PORT}:3000"`);
		expect(web).toMatch(/proxy's network/);
	});

	it('passes the auth secret and OAuth variables to web only, all optional', async () => {
		await runInit(['--origin', 'http://a.io'], dir);
		const compose = await read('compose.yaml');
		const web = compose.slice(compose.indexOf('  web:'), compose.indexOf('  runner:'));
		const runner = compose.slice(compose.indexOf('  runner:'), compose.indexOf('networks:\n'));
		for (const name of [
			'BETTER_AUTH_SECRET',
			'GITHUB_CLIENT_ID',
			'GITHUB_CLIENT_SECRET',
			'GOOGLE_CLIENT_ID',
			'GOOGLE_CLIENT_SECRET'
		]) {
			expect(web).toContain(`${name}: \${${name}:-}`);
			expect(runner).not.toContain(name);
		}
	});
});
