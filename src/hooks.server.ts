import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createApp } from '$lib/server/app';
import { createHandle } from '$lib/server/handle';
import { installLogRedaction, isKnownCode } from '$lib/server/identity/auth';

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

/** A short identifier: what an error's class name looks like. Anything else is logged as `Error`. */
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

/**
 * What an unexpected error prints. SvelteKit's default prints `[status] METHOD pathname` and the stack, and
 * the pathname of the Accept invite page holds the invite token. This prints the route id (`/invite/[token]`)
 * for every route instead, and then the error's class name and a known code only: never its message or stack, which can hold
 * query text, paths and what a request or a provider sent.
 */
export function formatServerError(
	status: number,
	error: unknown,
	event: { request: { method: string }; route: { id: string | null } }
): string {
	const head = `[${status}] ${event.request.method} ${event.route.id ?? '(no route)'}`;
	if (status === 404) return head;
	const name = error instanceof Error && SAFE_NAME.test(error.name) ? error.name : 'Error';
	const kind = error instanceof Error ? name : typeof error;
	// The code only if it is one of the known codes (the list `redactingLogger` uses): a token-shaped string, such as
	// an invite token, is not.
	const rawCode =
		error !== null && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
	const code = isKnownCode(rawCode) ? rawCode : undefined;
	return `${head} ${kind}${code ? ` ${code}` : ''}`;
}

export const handleError: HandleServerError = ({ error, event, status }) => {
	console.error(formatServerError(status, error, event));
	return { message: status === 404 ? 'Not Found' : 'Internal Error' };
};

installLogRedaction();
