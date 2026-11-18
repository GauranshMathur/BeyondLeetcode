/**
 * The Runner's log helpers. A leaf on purpose: `src/lib/server/logging.ts` loads Better Auth, which the
 * Runner must not carry, so the rule it applies to a log line is copied here instead of imported.
 */

/** Line breaks and every other control or bidi character: one line stays one line and nothing can forge another. */
const LOG_CONTROLS = /[\p{Cc}\u202A-\u202E\u2066-\u2069\u2028\u2029]/gu;

/**
 * The kind of a thrown value: the class name of an Error, and nothing else about it. A Docker daemon's reply
 * can reach an error's message, stack or cause, so none of them is read. The name comes from the constructor;
 * one that is not a plain identifier is `Error`, and a value that is not an Error, or whose traps throw, is
 * `NonError`. It never throws.
 */
export function errorKind(error: unknown): string {
	let kind = 'NonError';
	// The whole read sits in the try: a Proxy's trap can throw from `instanceof` as well as from the property reads.
	try {
		if (error instanceof Error) {
			kind = 'Error';
			// Read once and require a string: an object with a changing toString could otherwise leak text.
			const name: unknown = error.constructor?.name;
			if (typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) kind = name;
		}
	} catch {
		// a trap or getter that throws leaves the fixed word
	}
	return kind;
}

/** Prints one line, with control characters turned into spaces. A console that throws is ignored. */
export function logLine(text: string): void {
	try {
		console.error(text.replace(LOG_CONTROLS, ' '));
	} catch {
		// a failing log must not replace the answer or the error that is already on its way
	}
}
