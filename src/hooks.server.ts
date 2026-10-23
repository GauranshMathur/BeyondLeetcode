import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createApp } from '$lib/server/app';
import { createHandle } from '$lib/server/handle';
import { redactedArgument, redactInvite } from '$lib/server/identity/auth';

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

/**
 * What an unexpected error prints. SvelteKit's default prints `[status] METHOD pathname` and the stack, and
 * the pathname of the Accept invite page holds the invite token. This prints the route id (`/invite/[token]`)
 * for every route instead, and keeps the stack, with any invite path in it redacted.
 */
export function formatServerError(
	status: number,
	error: unknown,
	event: { request: { method: string }; route: { id: string | null } }
): string {
	const head = `[${status}] ${event.request.method} ${event.route.id ?? '(no route)'}`;
	if (status === 404) return head;
	const detail = error instanceof Error ? (error.stack ?? String(error)) : String(error);
	return `${head}\n${redactInvite(detail)}`;
}

export const handleError: HandleServerError = ({ error, event, status }) => {
	console.error(formatServerError(status, error, event));
	return { message: status === 404 ? 'Not Found' : 'Internal Error' };
};

const REDACTING = Symbol.for('beyondleetcode.redactingConsole');
type Wrapped = ((...args: unknown[]) => void) & { [REDACTING]?: true };

/**
 * Redacts at the sink: `console.error`, `warn`, `info` and `log` print strings with any invite path or invite
 * cookie text taken out, and Errors and objects as `util.inspect` prints them (message, stack, `cause`) with the
 * same redaction. Library code that logs on its own (Better Call, Better Auth's adapter) is covered without
 * chasing each logger. Idempotent: a second call, a second import or a hot reload does not wrap twice.
 */
export function installLogRedaction(target: Console = console): void {
	for (const method of ['error', 'warn', 'info', 'log'] as const) {
		const original = target[method] as Wrapped;
		if (original[REDACTING]) continue;
		const wrapped: Wrapped = (...args) => original.apply(target, args.map(redactedArgument));
		wrapped[REDACTING] = true;
		target[method] = wrapped as never;
	}
}

installLogRedaction();
