import type { ActionResult } from '@sveltejs/kit';
import type { BuildFiles } from '$lib/server/content/catalogue';
import type { HintsView, RunView, SubmitView } from '$lib/server/learning/core';
import type { LearningErrorCode } from '$lib/server/learning/errors';
import type { Language } from './languages';

/**
 * The Problem screen's wire contract: what its form actions answer and what the browser makes of it.
 * Plain TypeScript, importable by the server routes and the browser alike (type-only imports of the core).
 * A refusal travels as the Learning core's own code, so no side re-derives it from an HTTP status.
 */

/** A request the route itself could not read (not a form of this screen). Every other code is the core's. */
export type WireCode = LearningErrorCode | 'BadRequest';

/** The HTTP status each code is sent with. Informational: readers go by the code in the body. */
const STATUS: Record<WireCode, number> = {
	NotFound: 404,
	TopicLocked: 403,
	RevisionConflict: 409,
	InvalidBuild: 400,
	BadRequest: 400,
	RunnerUnavailable: 503
};

export const WIRE_CODES = Object.keys(STATUS) as WireCode[];

/** `revision`: set when the Learner's code was saved before the refusal, so the tab can carry on from it. */
export interface Refusal {
	code: WireCode;
	revision?: number;
}

export function encodeRefusal({ code, revision }: Refusal): { status: number; body: App.Error } {
	return {
		status: STATUS[code],
		body: revision === undefined ? { message: code } : { message: code, revision }
	};
}

export function decodeRefusal(body: unknown): Refusal | undefined {
	if (typeof body !== 'object' || body === null) return undefined;
	const { message, revision } = body as { message?: unknown; revision?: unknown };
	if (typeof message !== 'string' || !(WIRE_CODES as string[]).includes(message)) return undefined;
	return typeof revision === 'number'
		? { code: message as WireCode, revision }
		: { code: message as WireCode };
}

/**
 * A digest of a Build's files, the same on the browser and the server: SHA-256 (hex) over the JSON of
 * the [path, content] pairs sorted by path, as UTF-8. The keepalive save carries the digest of the
 * save still in flight so the Learning core can tell it is a save on top of the tab's own.
 */
export async function filesDigest(files: BuildFiles): Promise<string> {
	const pairs = Object.keys(files)
		.sort()
		.map((path) => [path, files[path]]);
	const bytes = new TextEncoder().encode(JSON.stringify(pairs));
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** What each action of the Problem route answers on success. */
export interface ReplyData {
	save: { revision: number };
	run: RunView;
	submit: SubmitView;
	switchLanguage: { language: Language };
	startFromReferenceCode: { files: BuildFiles; revision: number };
	revealHint: { hints: HintsView };
}

/** What the browser makes of an answer: the data, or why there is none. */
export type Reply =
	| { ok: true; data: unknown }
	| { ok: false; kind: 'signedOut' }
	| ({ ok: false; kind: 'refused' } & Refusal)
	| { ok: false; kind: 'unreachable' };

/** `response`: what fetch reported; `result`: the action result parsed from its body, if it parsed. */
export function toReply(
	response: { status: number; redirected: boolean },
	result: ActionResult | undefined
): Reply {
	if (response.status === 401 || response.redirected || result?.type === 'redirect')
		return { ok: false, kind: 'signedOut' };
	if (result?.type === 'success') return { ok: true, data: result.data };
	const refusal = result?.type === 'error' ? decodeRefusal(result.error) : undefined;
	if (refusal) return { ok: false, kind: 'refused', ...refusal };
	// No code to go by: a 4xx will never be accepted, anything else may pass.
	return response.status >= 400 && response.status < 500
		? { ok: false, kind: 'refused', code: 'BadRequest' }
		: { ok: false, kind: 'unreachable' };
}
