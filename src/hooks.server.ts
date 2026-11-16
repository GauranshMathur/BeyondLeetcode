import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { createApp } from '#lib/server/app.js';
import { ContentError } from '#lib/server/content/catalogue.js';
import { createHandle } from '#lib/server/handle.js';
import { INVITE_LOG_PATTERNS } from '#lib/server/identity/invites.js';
import { formatServerError, installLogRedaction } from '#lib/server/logging.js';
import {
	BETTER_AUTH_SECRET,
	CONTENT_DIR,
	DATABASE_URL,
	DEV_MODE,
	IDENTITY_TEST_LEARNER,
	NODE_ENV,
	ORIGIN,
	RUNNER_ADAPTER,
	RUNNER_TOKEN,
	RUNNER_URL
} from '$app/env/private';

let run: Handle;
let devMode = false;

/**
 * Runs once at server start; a missing CONTENT_DIR, DATABASE_URL, RUNNER_URL or RUNNER_TOKEN stops the server here,
 * a multi-user Instance without its BETTER_AUTH_SECRET or ORIGIN, and a multi-user Instance with DEV_MODE=1.
 */
export const init: ServerInit = async () => {
	const app = await createApp({
		CONTENT_DIR,
		DATABASE_URL,
		RUNNER_URL,
		RUNNER_TOKEN,
		IDENTITY_TEST_LEARNER,
		DEV_MODE,
		RUNNER_ADAPTER,
		NODE_ENV,
		BETTER_AUTH_SECRET,
		ORIGIN
	});
	run = createHandle(app);
	devMode = app.devMode;
};

/** The gate runs first (see createHandle), then Identity and the Learning core act for the request. */
export const handle: Handle = (input) => {
	// The app's answer, fixed at start: nothing the request carries, and no second read of the environment, reaches it.
	input.event.locals.devMode = devMode;
	return run(input);
};

/** The most issues the error page lists; a longer list ends with one "and N more" item. */
const MAX_ISSUES = 200;

/**
 * What the dev-mode error page lists for this error, or undefined when it is not a ContentError whose issues are a
 * list of strings. This hook must not throw (SvelteKit would then log the original error with its message), so
 * the whole decision and the read are guarded. The issues are read once, by index, into a new plain array: no
 * method of the source is called, so a Proxy or an Array subclass cannot hand back anything but its items.
 */
function contentIssuesFor(error: unknown): string[] | undefined {
	try {
		if (!(error instanceof ContentError)) return;
		const { issues } = error;
		if (!Array.isArray(issues)) return;
		const length: unknown = issues.length;
		if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) return;
		const shown: string[] = [];
		for (let i = 0; i < Math.min(length, MAX_ISSUES); i++) {
			const item: unknown = issues[i];
			if (typeof item !== 'string') return;
			shown.push(item);
		}
		if (length > MAX_ISSUES) shown.push(`and ${length - MAX_ISSUES} more`);
		return shown;
	} catch {
		return;
	}
}

/**
 * SvelteKit 3 passes every error here, expected ones included. An error thrown with `error(...)` (the Learning
 * core's refusals) is the app's own and already safe: it goes out unchanged and is not logged, as before. Anything
 * else is logged as the route id, the class name and a known code only, and answers with the generic message.
 * Dev mode adds one thing: for a ContentError (the content folder fails validation) the answer also carries the
 * issues the Content catalogue wrote (the first 200), so the author sees which file is wrong. The log line stays the same.
 */
export const handleError: HandleServerError = (input) => {
	if (input.kind === 'app') return input.error;
	const { error, event, kind } = input;
	const status = kind === 'unknown' ? 500 : error.status;
	console.error(formatServerError(status, error, event));
	if (devMode && kind === 'unknown') {
		const contentIssues = contentIssuesFor(error);
		if (contentIssues) return { message: 'Invalid content', contentIssues };
	}
	return { message: status === 404 ? 'Not Found' : 'Internal Error' };
};

installLogRedaction(INVITE_LOG_PATTERNS);
