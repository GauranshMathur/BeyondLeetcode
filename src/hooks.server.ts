import type { Handle, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { type App, createApp } from '$lib/server/app';
import { parseTheme, THEME_COOKIE, withTheme } from '$lib/theme';

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
	// No theme cookie means follow the device; a choice goes on <html> in the server render, so no flash.
	// Read when the page renders, not before: an action that just set the cookie is seen by its own response.
	return resolve(event, {
		transformPageChunk: ({ html }) => withTheme(html, parseTheme(event.cookies.get(THEME_COOKIE)))
	});
};
