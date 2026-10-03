import type { Handle, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { type App, createApp } from '$lib/server/app';

let app: App;

/** Runs once at server start; a missing CONTENT_DIR, DATABASE_URL, RUNNER_URL or RUNNER_TOKEN stops the server here. */
export const init: ServerInit = async () => {
	app = await createApp({
		CONTENT_DIR: env.CONTENT_DIR,
		DATABASE_URL: env.DATABASE_URL,
		RUNNER_URL: env.RUNNER_URL,
		RUNNER_TOKEN: env.RUNNER_TOKEN
	});
};

/** Local Mode: every request is the single Local Learner. */
export const handle: Handle = ({ event, resolve }) => {
	event.locals.learnerId = app.learnerId;
	event.locals.learning = app.core.forLearner(app.learnerId);
	return resolve(event);
};
