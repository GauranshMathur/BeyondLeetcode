import type { Handle, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createApp } from '$lib/server/app';
import { createHandle } from '$lib/server/handle';

let run: Handle;

/** Runs once at server start; a missing CONTENT_DIR, DATABASE_URL, RUNNER_URL or RUNNER_TOKEN stops the server here. */
export const init: ServerInit = async () => {
	const app = await createApp({
		CONTENT_DIR: env.CONTENT_DIR,
		DATABASE_URL: env.DATABASE_URL,
		RUNNER_URL: env.RUNNER_URL,
		RUNNER_TOKEN: env.RUNNER_TOKEN,
		IDENTITY_TEST_LEARNER: env.IDENTITY_TEST_LEARNER,
		NODE_ENV: env.NODE_ENV
	});
	run = createHandle(app);
};

/** The gate runs first (see createHandle), then Identity and the Learning core act for the request. */
export const handle: Handle = (input) => run(input);
