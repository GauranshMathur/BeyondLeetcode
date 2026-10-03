import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE, InitError, newToken, parseArgs, runInit } from './init';

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
		await writeFile(join(dir, '.env'), 'KEEP=1\n');
		await expect(runInit(['--origin', 'http://a.io'], dir)).rejects.toThrow(/already exists/);
		expect(await read('.env')).toBe('KEEP=1\n');
		await expect(read('compose.yaml')).rejects.toThrow();

		await runInit(['--origin', 'http://a.io', '--force'], dir);
		expect(envValue(await read('.env'), 'ORIGIN')).toBe('http://a.io');
	});

	it('generates a different token each time', () => {
		expect(newToken()).toHaveLength(48);
		expect(newToken()).not.toBe(newToken());
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
});
