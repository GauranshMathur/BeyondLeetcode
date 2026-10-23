import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createApp } from '$lib/server/app';
import { createHandle } from '$lib/server/handle';
import { installLogRedaction } from '$lib/server/identity/auth';

let run: Handle;

/**
 * Runs once at server start; a missing CONTENT_DIR, DATABASE_URL, RUNNER_URL or RUNNER_TOKEN stops the server here,
 * and so does a multi-user Instance without its BETTER_AUTH_SECRET or ORIGIN.
 */
export const init: ServerInit = async () => {
	const app = await createApp({
		CONTENT_DIR: env.CONTENT_DIR,
		DATABASE_URL: env.DATABASE_URL,
		RUNNER_URL: env.RUNNER_URL,
		RUNNER_TOKEN: env.RUNNER_TOKEN,
		IDENTITY_TEST_LEARNER: env.IDENTITY_TEST_LEARNER,
		RUNNER_ADAPTER: env.RUNNER_ADAPTER,
		NODE_ENV: env.NODE_ENV,
		BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
		ORIGIN: env.ORIGIN
	});
	run = createHandle(app);
};

/** The gate runs first (see createHandle), then Identity and the Learning core act for the request. */
export const handle: Handle = (input) => run(input);

/** A short token: what an error's name and code look like. Anything else is not logged. */
const SAFE_TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * What an unexpected error prints. SvelteKit's default prints `[status] METHOD pathname` and the stack, and
 * the pathname of the Accept invite page holds the invite token. This prints the route id (`/invite/[token]`)
 * for every route instead, and then the error's name and code only: never its message or stack, which can hold
 * query text, paths and what a request or a provider sent.
 */
export function formatServerError(
	status: number,
	error: unknown,
	event: { request: { method: string }; route: { id: string | null } }
): string {
	const head = `[${status}] ${event.request.method} ${event.route.id ?? '(no route)'}`;
	if (status === 404) return head;
	const field = (key: string) => {
		const value = (error as Record<string, unknown> | null | undefined)?.[key];
		return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : undefined;
	};
	const kind = error instanceof Error ? (field('name') ?? 'Error') : typeof error;
	const code = error !== null && typeof error === 'object' ? field('code') : undefined;
	return `${head} ${kind}${code ? ` ${code}` : ''}`;
}

export const handleError: HandleServerError = ({ error, event, status }) => {
	console.error(formatServerError(status, error, event));
	return { message: status === 404 ? 'Not Found' : 'Internal Error' };
};

installLogRedaction();
