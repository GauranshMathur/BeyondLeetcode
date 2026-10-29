import { formatWithOptions, inspect } from 'node:util';
import { BASE_ERROR_CODES } from 'better-auth';

/**
 * What a secret's owner hands the redaction engine. `marked` redacts the secret wherever a text shows it in a
 * shape the owner knows (a path, a cookie), and returns the text otherwise unchanged. `bareTokenLength` is the
 * length of the secret's token: in a record that held a terminal escape, a bare run of that many base64url
 * characters is redacted too, since an escape can separate a token from its marker.
 */
export interface LogPatterns {
	marked(text: string): string;
	bareTokenLength: number;
}

/**
 * Terminal escape sequences. A caller's own string can hold them anywhere, for example inside a cookie value
 * (`name=ESC[31mTOKEN`) where they would hide the token from a pattern. A complete sequence is CSI (`ESC [`
 * or the one-byte `U+009B`, digits and `;`-like parameters, a final byte; the rare intermediate bytes are
 * not accepted, because ` /i` read as intermediate and final would eat the start of an invite path), OSC (`ESC ]` up to BEL or `ESC \`) or a two-character
 * escape. An introducer that starts none of these (a lone ESC, an OSC with no terminator, a CSI with no final
 * byte) is not a sequence: it must not swallow the text after it, so it is matched alone and shown as a placeholder.
 */
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const CSI8 = String.fromCharCode(0x9b);
const escapePattern = (csiIntermediates: string) =>
	new RegExp(
		[
			`${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`,
			`(?:${ESC}\\[|${CSI8})[0-?]*${csiIntermediates}[@-~]`,
			`${ESC}[@-Z\\\\^_]`,
			`${ESC}\\](?:[0-9]*;)?|${ESC}\\[?|${CSI8}`
		].join('|'),
		'g'
	);
/** The sequences the placeholder view removes: no CSI intermediate bytes, which would eat the start of ` /invite/`. */
const TERMINAL_ESCAPES = escapePattern('');
/** The sequences the deleted view removes: a CSI as a terminal reads it, intermediate bytes included. */
const TERMINAL_ESCAPES_FULL = escapePattern('[ -/]*');
const HAS_ESCAPE = new RegExp(`[${ESC}${CSI8}]`);
/** An introducer that started no complete sequence (ESC, ESC [, ESC ] with its number and `;`, or U+009B), as `TERMINAL_ESCAPES` matched it. */
const LONE_INTRODUCER = new RegExp(`^(?:${ESC}(?:\\](?:[0-9]*;)?|\\[)?|${CSI8})$`);
/**
 * What an introducer that is not part of a complete sequence becomes: U+241B, the visible symbol for ESC. It
 * is chosen so that it can never end or start a match. It is not `[` (the path pattern skips `/invite/[`, the
 * route id, so `/invite/[esc]TOKEN` would print the token), not a space and not a delimiter, so it is a
 * character a token or a cookie value may hold: `/invite/` + it + `TOKEN` is one token to the patterns.
 */
const ESCAPE_PLACEHOLDER = String.fromCharCode(0x241b);

/**
 * Takes the invite token out of any text. Text with a terminal escape in it is printed with the escapes removed
 * (colours go) and then redacted, always: the removed-escape view is the one that is redacted, so the view that
 * is checked and the view that is printed cannot disagree about where a token is. An introducer that is not part
 * of a complete sequence is shown as a visible placeholder, never allowed to swallow the text after it. In such a
 * record a bare run of 43 or more base64url characters is redacted too, and the placeholder view and the
 * escapes-deleted view are both redacted, the one that leaves the least token-like text being printed.
 */
export const redactText = (text: string, patterns: LogPatterns): string => {
	if (!HAS_ESCAPE.test(text)) return patterns.marked(text);
	const view = (pattern: RegExp, replacement: (sequence: string) => string) =>
		redactBareTokens(patterns.marked(text.replace(pattern, replacement)), patterns.bareTokenLength);
	// An introducer shown as a placeholder (a character a token may hold, so it cannot stand between a marker and
	// its value), and the same text with the introducers deleted outright. Whichever found more is printed.
	const shown = view(TERMINAL_ESCAPES, (sequence) =>
		LONE_INTRODUCER.test(sequence) ? ESCAPE_PLACEHOLDER : ''
	);
	const deleted = view(TERMINAL_ESCAPES_FULL, () => '');
	// Chosen by what is left, not by how many markers matched: the view that keeps the fewest characters in long
	// base64url runs (what a token looks like), the deleted view on a tie.
	// Nothing found in either: the placeholder stays visible.
	if (!shown.includes('[redacted]') && !deleted.includes('[redacted]')) return shown;
	return exposed(shown) < exposed(deleted) ? shown : deleted;
};

/** How many characters of a record sit in base64url runs of 20 or more: a direct measure of token-like text left. */
const exposed = (text: string) =>
	(text.match(/[A-Za-z0-9_-]{20,}/g) ?? []).reduce((sum, run) => sum + run.length, 0);

/**
 * In a record that held an escape, every bare run of 43 or more base64url characters (an invite token, or a token
 * with a word glued to it) is redacted wherever it stands, since an escape or what it drags along (a space, a `;`) can separate a
 * token from its marker in ways no marker pattern follows. Never applied to escape-free text.
 */
const redactBareTokens = (text: string, tokenLength: number) =>
	text.replace(new RegExp(`(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{${tokenLength},}`, 'g'), '[redacted]');

/** What a console call would print for these arguments (`%s` and friends, Errors with stack and `cause`), redacted. */
export const redactedLine = (args: unknown[], patterns: LogPatterns): string => {
	try {
		return redactText(formatWithOptions({ depth: null, colors: false }, ...args), patterns);
	} catch {
		return '[unprintable]';
	}
};

const REDACTING = Symbol.for('beyondleetcode.redactingConsole');
type Wrapped = ((...args: unknown[]) => unknown) & { [REDACTING]?: true };

/**
 * Redacts at the sink. Every console method that prints is replaced once by one that formats the whole record
 * first (`util.formatWithOptions`, `depth: null`, so `%s`, Errors with `cause` and objects are text), redacts
 * that text and hands the original method a single string. Library code that logs on its own is covered
 * without chasing each logger. Idempotent through a marker on each wrapper, so a second call, a second import
 * or a hot reload does not wrap twice. Bun's console does not go through `process.stdout.write`, so patching
 * the stream would do nothing there.
 *
 * Not covered, by decision: logging before this runs, direct `process.stdout/stderr.write`, other processes.
 */
export function installLogRedaction(patterns: LogPatterns, target: Console = console): void {
	const wrap = (method: string, make: (original: Wrapped) => Wrapped) => {
		const original = (target as unknown as Record<string, unknown>)[method] as Wrapped | undefined;
		if (typeof original !== 'function' || original[REDACTING]) return;
		const wrapped = make((...args) => original.apply(target, args));
		wrapped[REDACTING] = true;
		(target as unknown as Record<string, unknown>)[method] = wrapped;
	};
	// Whole-record formatting for the methods that print a message.
	const FORMATTED = [
		'error',
		'warn',
		'info',
		'log',
		'debug',
		'trace',
		'dirxml',
		'group',
		'groupCollapsed'
	];
	for (const method of FORMATTED) {
		wrap(
			method,
			(original) =>
				(...args) =>
					args.length === 0 ? original() : original(redactedLine(args, patterns))
		);
	}
	wrap(
		'assert',
		(original) =>
			(condition, ...args) =>
				condition ? original(condition) : original(condition, redactedLine(args, patterns))
	);
	// Printed through their inspected output, colours off: an ANSI sequence between a name and its value would hide it.
	wrap('dir', (original) => (value, options) => {
		// `stylize` is an inspect option too (a callback that colours every piece): it, like `colors`, is dropped,
		// so what is formatted is plain text.
		const {
			stylize: _stylize,
			colors: _colors,
			...plain
		} = (options ?? {}) as Record<string, unknown>;
		return original(redactText(inspect(value, { ...plain, depth: null, colors: false }), patterns));
	});
	wrap(
		'table',
		(original) => (data) =>
			original(redactText(inspect(data, { depth: null, colors: false }), patterns))
	);
	// Every other member that takes arguments (count, timeLog, timeEnd, Bun's write, ...) is wrapped by
	// what it is given, not by name: each argument is redacted and the argument count is kept. The ones that
	// take a label (time, timeEnd, count, countReset) are included, so a label is the same on both sides and
	// counters and timers stay correct. Only members with nothing to print are left alone.
	const LEAVE = new Set(['constructor', 'groupEnd', 'clear', 'context', 'createTask']);
	const labels = createLabelBook(patterns);
	const names = new Set<string>();
	for (let o: object | null = target; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
		for (const name of Object.getOwnPropertyNames(o)) names.add(name);
	}
	for (const name of names) {
		const member = (target as unknown as Record<string, unknown>)[name];
		if (
			LEAVE.has(name) ||
			name.startsWith('_') ||
			typeof member !== 'function' ||
			/^[A-Z]/.test(name)
		)
			continue;
		if (name in { dir: 1, table: 1, assert: 1 } || FORMATTED.includes(name)) continue;
		wrap(name, (original) => (...args) => {
			if (name === 'write') return original(...redactedWrite(args, patterns));
			const [label, ...rest] = args;
			// The members that name a counter or a timer get a label of their own per original label: two
			// labels that differ only in a token are two counters, though both print as the same redacted text.
			const named = LABELLED.has(name) && typeof label === 'string';
			const shown = named ? labels.safe(label) : redactedMember(label, patterns);
			if (rest.length === 0) return original(shown);
			if (name === 'timeLog') {
				// The label and the data are one record (`name=` then the value), but the label is passed on by
				// itself so the timer is still found by it.
				const redactedLabel = named ? redactedMember(label, patterns) : shown;
				// The data is formatted on its own (its first argument may hold the `%s`), then joined to the label.
				const whole = redactText(
					`${String(label)} ${formatWithOptions({ depth: null, colors: false }, ...rest)}`,
					patterns
				);
				const head = typeof redactedLabel === 'string' ? redactedLabel : String(redactedLabel);
				const tail = whole.startsWith(head)
					? whole.slice(head.length).replace(/^ /, '')
					: redactedLine(rest, patterns);
				return original(shown, tail);
			}
			return original(shown, redactedLine(rest, patterns));
		});
	}
}

const isBinary = (value: unknown): value is ArrayBuffer | ArrayBufferView =>
	value instanceof ArrayBuffer || ArrayBuffer.isView(value);

/** Bytes as strict UTF-8 text, or null when they are not valid UTF-8 (those are passed on as they are). */
const strictText = (value: ArrayBuffer | ArrayBufferView): string | null => {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(value as ArrayBuffer);
	} catch {
		return null;
	}
};

/** The members that name a counter or a timer by their first argument. */
const LABELLED = new Set(['count', 'countReset', 'time', 'timeLog', 'timeEnd']);

/**
 * Printable labels for counters and timers. A label is redacted to text, but two labels that differ only in
 * the part that is redacted (two invite paths) must stay two counters. Each original label that redaction
 * changes gets its own printable one: its redacted text, or that text with ` (2)`, ` (3)`... when another
 * original label already printed as it. The same original label always gets the same one, so a timer is found
 * again and a counter counts on. A label with nothing to redact is itself and is not kept. The book holds one
 * entry per distinct label with a token in it, as the console's own counters and timers do, so it is not capped:
 * a cap would make labels past it share a counter.
 */
function createLabelBook(patterns: LogPatterns) {
	const byOriginal = new Map<string, string>();
	const taken = new Set<string>();
	return {
		safe(original: string): string {
			const base = redactText(original, patterns);
			if (base === original) return original;
			const known = byOriginal.get(original);
			if (known !== undefined) return known;
			let shown = base;
			for (let n = 2; taken.has(shown); n++) shown = `${base} (${n})`;
			byOriginal.set(original, shown);
			taken.add(shown);
			return shown;
		}
	};
}

/**
 * In a latin1 record, byte 0xa0 is the one above 0x7f that a pattern's `\s` reads as a space and so would end a
 * token early. It is swapped for a private-use character that no pattern treats as a space or a delimiter, and
 * back. The other high bytes (0x9b, the one-byte CSI, among them) are left as they are for the patterns to see.
 */
const SHIELDED = String.fromCharCode(0xe0a0);
const shield = (latin1: string) => latin1.replaceAll(String.fromCharCode(0xa0), SHIELDED);
const unshield = (text: string) => text.replaceAll(SHIELDED, String.fromCharCode(0xa0));

/**
 * The arguments for Bun's `console.write`: all of them are joined into one record with nothing in between
 * (as `write('a', 'b')` prints `ab`, no separators, no `%s`) before anything is redacted, so a token cannot be
 * split across arguments. When every part is valid UTF-8 the record is text and is redacted as text. When
 * any part is bytes that are not, the whole record is read as latin1 (every byte one character, so none is
 * lost), redacted with the bytes above 0x7f shielded from the patterns (a byte such as 0xa0 would read as a
 * space), and written back as the same bytes: the invalid bytes stay as they were, and ASCII token text goes.
 * What is written and the count returned stay native.
 */
function redactedWrite(args: unknown[], patterns: LogPatterns): unknown[] {
	const parts = args.map((a) => (isBinary(a) ? bytesOf(a) : new TextEncoder().encode(String(a))));
	const record = Buffer.concat(parts);
	let text: string | null = null;
	try {
		// `ignoreBOM`: a byte-order mark is part of what was written, and is kept.
		text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(record);
	} catch {
		text = null;
	}
	if (text !== null) return [redactText(text, patterns)];
	const redacted = unshield(redactText(shield(record.toString('latin1')), patterns));
	return [new Uint8Array(Buffer.from(redacted, 'latin1'))];
}

const bytesOf = (value: ArrayBuffer | ArrayBufferView): Uint8Array =>
	value instanceof ArrayBuffer
		? new Uint8Array(value)
		: new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

/** One argument of an unlisted console member: text redacted, bytes decoded then redacted, anything else inspected. */
function redactedMember(value: unknown, patterns: LogPatterns): unknown {
	if (typeof value === 'string') return redactText(value, patterns);
	if (isBinary(value))
		return redactText(
			strictText(value) ?? new TextDecoder().decode(value as ArrayBuffer),
			patterns
		);
	if (
		value === undefined ||
		value === null ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value;
	}
	return redactedLine([value], patterns);
}

/** A short token: what an Error's class name looks like. */
const SAFE_TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;

/** The one control-and-bidi class: C0 and C1 controls (U+0000-U+001F, U+007F-U+009F) and the bidi controls (U+202A-U+202E, U+2066-U+2069). */
const CONTROL_OR_BIDI_CLASS = '\\p{Cc}\\u202A-\\u202E\\u2066-\\u2069';
export const CONTROL_OR_BIDI = new RegExp(`[${CONTROL_OR_BIDI_CLASS}]`, 'u');

/** Line breaks and every other control or bidi character, so one record is one line and nothing can forge another. */
const LOG_CONTROLS = new RegExp(`[${CONTROL_OR_BIDI_CLASS}\\u2028\\u2029]`, 'gu');

/** The codes of our own refusals. */
const OUR_CODES = ['SIGN_UP_CLOSED', 'NAME_TOO_LONG', 'NAME_INVALID_CHARACTERS', 'NAME_REQUIRED'];

/** The codes Better Auth's OAuth callback and state handling answer with (`oauth2/errors.mjs`, `state.mjs`, `link-account.mjs`). */
const OAUTH_CODES = [
	'no_code',
	'oauth_provider_not_found',
	'issuer_missing',
	'issuer_mismatch',
	'invalid_code',
	'nonce_binding_missing',
	'unable_to_get_user_info',
	'no_callback_url',
	'unable_to_link_account',
	'email_does_not_match',
	'account_already_linked_to_different_user',
	'email_not_found',
	'email_not_verified',
	'account_not_linked',
	'signup_disabled',
	'unable_to_create_user',
	'unable_to_create_session',
	'unable_to_update_account',
	'state_not_found',
	'state_mismatch',
	'state_security_mismatch',
	'state_generation_error',
	'invalid_callback_request',
	'internal_server_error'
];

/** The system and database codes an Error may carry (Node's errno names, Prisma's `P1234`). */
const SYSTEM_CODES = [
	'ECONNRESET',
	'ECONNREFUSED',
	'ECONNABORTED',
	'ETIMEDOUT',
	'ENOTFOUND',
	'EAI_AGAIN',
	'EHOSTUNREACH',
	'EPIPE',
	'ENOENT',
	'EACCES'
];

/**
 * The only codes that are ever logged: Better Auth's own error codes (`BASE_ERROR_CODES`), ours, the OAuth
 * ones, the system ones, and Prisma's. A caller can send any token-shaped text in `?error=`, so a code is
 * recognized by being in this set, never by its shape.
 */
const KNOWN_CODES = new Set<string>([
	...Object.keys(BASE_ERROR_CODES),
	...OUR_CODES,
	...OAUTH_CODES,
	...SYSTEM_CODES
]);
/** Whether a value is one of the codes that may be logged (Better Auth's, ours, the OAuth, system and Prisma ones). */
export const isKnownCode = (value: unknown): value is string =>
	typeof value === 'string' && (KNOWN_CODES.has(value) || /^P\d{4}$/.test(value));

/**
 * One log argument as something safe to print. Text from outside (a query string, a provider's answer, a
 * request header) is never printed: a string is kept only when it is a recognized code, and an object is
 * reduced to its `code` or `error` field when that is one. An Error is its class name and recognized code.
 * Numbers, booleans, null and undefined pass.
 */
export function loggable(arg: unknown): unknown {
	if (arg === null || arg === undefined) return arg;
	if (typeof arg === 'number' || typeof arg === 'boolean') return arg;
	if (typeof arg === 'string') return isKnownCode(arg) ? arg : '[text omitted]';
	const field = (key: string) => {
		const value = (arg as Record<string, unknown>)[key];
		return isKnownCode(value) ? value : undefined;
	};
	if (arg instanceof Error) {
		const code = field('code');
		const name = SAFE_TOKEN.test(arg.name) ? arg.name : 'Error';
		return code ? `${name} ${code}` : name;
	}
	if (typeof arg === 'object') {
		const code = field('code') ?? field('error');
		return code ? `code=${code}` : '[object omitted]';
	}
	return '[value omitted]';
}

/**
 * The fixed part of a Better Auth message. Better Auth builds some messages around what the request sent
 * (`Invalid origin: <Origin header>`, `Invalid callbackURL: <url>`), always after a `: `, so the message is cut
 * there; a message that still holds an address is dropped. Control characters become spaces.
 */
export function fixedText(message: unknown): string {
	const text = String(message).replace(LOG_CONTROLS, ' ');
	const fixed = text.split(': ')[0] ?? '';
	if (fixed.includes('://')) return '[message omitted]';
	return fixed.slice(0, 200);
}

/**
 * Better Auth's own logger. Better Auth logs what a visitor or a provider sent (a callback's `error`
 * parameter, a provider's error body, the Origin header, the `callbackURL` of a refused request, which can be
 * `/invite/<token>`), so a record is built only from safe parts: the fixed text of the message (`fixedText`)
 * and each argument through `loggable` (recognized codes and an Error's class name; never free text or a
 * response body). The owner's patterns are applied on top of that.
 */
export const redactingLogger = (patterns: LogPatterns) => ({
	log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]) {
		const line = redactedLine([fixedText(message), ...args.map(loggable)], patterns);
		const write = level === 'debug' ? console.debug : console[level];
		write(`[Better Auth] ${line.replace(LOG_CONTROLS, ' ')}`);
	}
});

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
 * Logs a failure in a place that is not the server hook: `where` (a fixed label chosen by the caller), the
 * error's class name and a known code only, as `formatServerError` does. Never the message, the stack or a
 * cause, which can hold what a request or a provider sent.
 */
export function logFailure(where: string, error: unknown): void {
	const name = error instanceof Error && SAFE_NAME.test(error.name) ? error.name : 'Error';
	const kind = error instanceof Error ? name : typeof error;
	const rawCode =
		error !== null && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
	const code = isKnownCode(rawCode) ? rawCode : undefined;
	console.error(`${where.replace(LOG_CONTROLS, ' ')} ${kind}${code ? ` ${code}` : ''}`);
}
