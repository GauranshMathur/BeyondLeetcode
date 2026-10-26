import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { createApp } from '#lib/server/app.js';
import { createHandle } from '#lib/server/handle.js';
import { installLogRedaction, isKnownCode } from '#lib/server/identity/auth.js';
import {
	BETTER_AUTH_SECRET,
	CONTENT_DIR,
	DATABASE_URL,
	IDENTITY_TEST_LEARNER,
	NODE_ENV,
	ORIGIN,
	RUNNER_ADAPTER,
	RUNNER_TOKEN,
	RUNNER_URL
} from '$app/env/private';

let run: Handle;

/**
 * Runs once at server start; a missing CONTENT_DIR, DATABASE_URL, RUNNER_URL or RUNNER_TOKEN stops the server here,
 * and so does a multi-user Instance without its BETTER_AUTH_SECRET or ORIGIN.
 */
export const init: ServerInit = async () => {
	const app = await createApp({
		CONTENT_DIR,
		DATABASE_URL,
		RUNNER_URL,
		RUNNER_TOKEN,
		IDENTITY_TEST_LEARNER,
		RUNNER_ADAPTER,
		NODE_ENV,
		BETTER_AUTH_SECRET,
		ORIGIN
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

/**
 * SvelteKit 3 passes every error here, expected ones included. An error thrown with `error(...)` (the Learning
 * core's refusals) is the app's own and already safe: it goes out unchanged and is not logged, as before. Anything
 * else is logged as the route id, the class name and a known code only, and answers with the generic message.
 */
export const handleError: HandleServerError = (input) => {
	if (input.kind === 'app') return input.error;
	const { error, event, kind } = input;
	const status = kind === 'unknown' ? 500 : error.status;
	console.error(formatServerError(status, error, event));
	return { message: status === 404 ? 'Not Found' : 'Internal Error' };
};

installLogRedaction();
