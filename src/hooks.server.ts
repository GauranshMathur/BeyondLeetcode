import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { createApp } from '#lib/server/app.js';
import { createHandle } from '#lib/server/handle.js';
import { INVITE_LOG_PATTERNS } from '#lib/server/identity/invites.js';
import { formatServerError, installLogRedaction } from '#lib/server/logging.js';
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

installLogRedaction(INVITE_LOG_PATTERNS);
