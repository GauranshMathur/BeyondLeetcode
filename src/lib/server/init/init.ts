import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, chown, copyFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** `init` role (ADR 0004): writes compose.yaml and .env for the operator into the mounted folder. */

export const DEFAULT_IMAGE = 'ghcr.io/gauranshmathur/beyondleetcode:latest';
const TOKEN_LENGTH = 48;
const COMPOSE_TEMPLATE = new URL('./compose.yaml', import.meta.url);

export class InitError extends Error {}

export interface InitOptions {
	origin: string;
	port: number;
	force: boolean;
}

export const USAGE = `Usage: docker run --rm -v "$PWD":/out ghcr.io/gauranshmathur/beyondleetcode init --origin <public-url> [--port 3000] [--force]

  --origin  Public URL of this Instance, e.g. https://learn.example.com (required).
  --port    Host port the web container listens on (default 3000).
  --force   Overwrite compose.yaml and .env if they exist.`;

export function parseArgs(args: string[]): InitOptions {
	let origin: string | undefined;
	let port = 3000;
	let force = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--force') force = true;
		else if (arg === '--origin' || arg === '--port') {
			const value = args[++i];
			if (value === undefined) throw new InitError(`${arg} needs a value.`);
			if (arg === '--origin') origin = value;
			else {
				port = Number(value);
				if (!Number.isInteger(port) || port < 1 || port > 65535) {
					throw new InitError(`--port must be a whole number from 1 to 65535, got "${value}".`);
				}
			}
		} else throw new InitError(`Unknown option "${arg}".`);
	}
	if (!origin) {
		throw new InitError(
			'--origin is required: the public URL of this Instance, e.g. --origin https://learn.example.com'
		);
	}
	return { origin: normalizeOrigin(origin), port, force };
}

function normalizeOrigin(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new InitError(`--origin "${value}" is not a URL. Use e.g. https://learn.example.com`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new InitError(`--origin must start with http:// or https://, got "${value}".`);
	}
	return url.origin;
}

export function newToken(): string {
	// Hex, so it never needs quoting in a .env file.
	return randomBytes(TOKEN_LENGTH / 2).toString('hex');
}

export function envFile(options: InitOptions, image: string, token = newToken()): string {
	return `# Written by \`init\`. Keep this file private: it holds the Runner token.

# Public URL of this Instance. SvelteKit's CSRF check compares form posts against it.
# Behind a reverse proxy, see the PROTOCOL_HEADER/HOST_HEADER block in compose.yaml instead.
ORIGIN=${options.origin}

# Host port the web container is published on.
PORT=${options.port}

# Shared secret between web and runner (48 random characters). Change it only by restarting both.
RUNNER_TOKEN=${token}

# Image both containers run. Pin a version tag to control upgrades.
BEYONDLEETCODE_IMAGE=${image}
`;
}

/** Writes both files into `outDir`, or throws without writing anything. Returns the next steps. */
export async function runInit(
	args: string[],
	outDir: string,
	image = process.env.BEYONDLEETCODE_IMAGE || DEFAULT_IMAGE
): Promise<string> {
	const options = parseArgs(args);
	const composePath = join(outDir, 'compose.yaml');
	const envPath = join(outDir, '.env');
	if (!options.force) {
		const existing = [composePath, envPath].filter(existsSync);
		if (existing.length > 0) {
			throw new InitError(`${existing.join(' and ')} already exists. Pass --force to overwrite.`);
		}
	}
	await copyFile(COMPOSE_TEMPLATE, composePath);
	await writeFile(envPath, envFile(options, image), { mode: 0o600 });
	await chmod(envPath, 0o600); // `mode` above only applies to a new file; --force may overwrite one.
	// Run as root in the container: hand the files to whoever owns the mounted folder.
	const { uid, gid } = await stat(outDir);
	for (const path of [composePath, envPath]) await chown(path, uid, gid).catch(() => {});
	return `Wrote compose.yaml and .env.

Next:
  docker compose up -d
  then open ${options.origin}`;
}

if (import.meta.main) {
	try {
		console.log(await runInit(process.argv.slice(2), process.env.INIT_OUT_DIR || '/out'));
	} catch (error) {
		if (!(error instanceof InitError)) throw error;
		console.error(`init: ${error.message}\n\n${USAGE}`);
		process.exit(2);
	}
}
