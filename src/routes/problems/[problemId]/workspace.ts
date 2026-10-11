import type { Language } from '$lib/languages';
import type { BuildRef, RunView, SubmitView } from '$lib/server/learning/core';
import type { Outcome } from './outcome';

/**
 * The Problem screen's state machine: plain TypeScript, no Svelte, no DOM, no fetch, no timers.
 * `transition(state, event)` returns the next state and at most one request to send; the
 * component renders the state, runs the request and the timer, and feeds the answer back as a
 * `response` event. One request is on the wire at a time: Run, Submit and a Language switch
 * that arrive meanwhile wait in `queued` and go out when the answer comes.
 */

export const SAVE_DELAY_MS = 1000;
export const RETRY_DELAY_MS = 5 * SAVE_DELAY_MS;

export type SaveState = 'saved' | 'edited' | 'saving' | 'failed' | 'rejected' | 'conflict';
type Files = Record<string, string>;
type Act = 'run' | 'submit';

/** What the machine asks the component to send. Save, Run and Submit all carry the Build and its reference. */
export type Request =
	| { kind: 'save' | Act; build: BuildRef; files: Files; keepalive?: true }
	| { kind: 'switch'; language: Language };

export interface Session {
	/** The reference the server issued; only its revision changes, to what the server reports. */
	readonly build: BuildRef;
	readonly files: Files;
	readonly save: SaveState;
	/** Code the server has not been sent yet. */
	readonly dirty: boolean;
	readonly outcome?: Outcome;
	readonly switching: boolean;
	readonly switchFailed: boolean;
	/** The screen is being left: a failed save is not retried. */
	readonly closed: boolean;
	/** What is on the wire. */
	readonly inFlight?: Request['kind'];
	/** What waits for it. */
	readonly queued?: Act | { switchTo: Language };
}

/** How the component reports an answer: the data of a success, or a failure with its HTTP status (0: none arrived). */
export type Reply = { ok: true; data: unknown } | { ok: false; status: number; revision?: number };

export type Event =
	| { type: 'edit'; files: Files }
	| { type: 'tick' }
	| { type: 'run' }
	| { type: 'submit' }
	| { type: 'switch'; language: Language }
	| { type: 'response'; reply: Reply }
	/** Leaving the page: send what is pending. `final` when the screen is going away for good. */
	| { type: 'flush'; final: boolean };

export interface Step {
	readonly state: Session;
	readonly send?: Request;
	/** Start the timer (replacing any running one) to fire a `tick`, or stop it. */
	readonly timer?: { afterMs: number } | 'cancel';
}

export function begin(build: BuildRef, files: Files): Session {
	return {
		build,
		files: { ...files },
		save: 'saved',
		dirty: false,
		switching: false,
		switchFailed: false,
		closed: false
	};
}

export const isBusy = (s: Session) =>
	s.outcome?.kind === 'running' || s.outcome?.kind === 'submitting';

const blocked = (s: Session) => s.save === 'conflict' || s.save === 'rejected';

/** Sends `kind` now with the latest code, which saves it too. */
function sendBuild(s: Session, kind: 'save' | Act, keepalive = false): Step {
	return {
		state: { ...s, dirty: false, save: 'saving', inFlight: kind },
		send: { kind, build: s.build, files: s.files, ...(keepalive && { keepalive: true as const }) },
		timer: 'cancel'
	};
}

/** The pending Language switch, once nothing is on the wire: send what is unsent first, then switch. */
function continueSwitch(s: Session, language: Language): Step {
	if (blocked(s))
		return { state: { ...s, switching: false, switchFailed: true, queued: undefined } };
	if (s.dirty) return sendBuild({ ...s, queued: { switchTo: language } }, 'save');
	return {
		state: { ...s, inFlight: 'switch', queued: undefined },
		send: { kind: 'switch', language }
	};
}

/** Edits made while a request was out, or a failure to retry, go out on the next tick. */
function follow(s: Session, failed: boolean): Step {
	if (!s.dirty || blocked(s) || (failed && s.closed)) return { state: s };
	return { state: s, timer: { afterMs: failed ? RETRY_DELAY_MS : 0 } };
}

export function transition(s: Session, event: Event): Step {
	switch (event.type) {
		case 'edit':
			if (s.save === 'conflict') return { state: s };
			return {
				state: { ...s, files: event.files, dirty: true, save: 'edited' },
				timer: { afterMs: SAVE_DELAY_MS }
			};

		case 'tick':
			if (s.inFlight || !s.dirty || s.save === 'conflict' || s.switching) return { state: s };
			return sendBuild(s, 'save');

		case 'run':
		case 'submit': {
			if (isBusy(s) || blocked(s) || s.switching) return { state: s };
			const pending = {
				...s,
				outcome: { kind: event.type === 'run' ? 'running' : 'submitting' } as Outcome
			};
			// An autosave is on the wire: this must carry the revision it produces, so it waits.
			if (s.inFlight) return { state: { ...pending, queued: event.type }, timer: 'cancel' };
			return sendBuild(pending, event.type);
		}

		case 'switch': {
			if (isBusy(s) || s.switching || event.language === s.build.language) return { state: s };
			const next = { ...s, switching: true, switchFailed: false };
			if (s.inFlight)
				return { state: { ...next, queued: { switchTo: event.language } }, timer: 'cancel' };
			return { ...continueSwitch(next, event.language), timer: 'cancel' };
		}

		case 'flush': {
			const closed = s.closed || event.final;
			if (s.inFlight || !s.dirty || s.save === 'conflict') {
				return { state: { ...s, closed }, timer: 'cancel' };
			}
			return sendBuild({ ...s, closed }, 'save', true);
		}

		case 'response':
			return s.inFlight
				? answered({ ...s, inFlight: undefined }, s.inFlight, event.reply)
				: { state: s };
	}
}

/** The answer to the request of `kind`. */
function answered(s: Session, kind: Request['kind'], reply: Reply): Step {
	const status = reply.ok ? 200 : reply.status;
	const wasAct = kind === 'run' || kind === 'submit';

	if (kind === 'switch') {
		// A switch that went through reloads the screen; either way it is no longer under way.
		return { state: { ...s, switching: false, switchFailed: !reply.ok } };
	}

	// What waited for a save: Run or Submit go out with the new revision; a switch goes on.
	const resume = (after: Session): Step => {
		const waiting = after.queued;
		if (waiting === undefined) return follow(after, false);
		if (typeof waiting === 'object')
			return continueSwitch({ ...after, queued: undefined }, waiting.switchTo);
		return sendBuild({ ...after, queued: undefined }, waiting);
	};

	if (status === 409 || (status >= 400 && status < 500)) {
		// 409: the Build moved on (another tab, a switched Language). Other 4xx: the server will never accept it.
		const switchWaiting = typeof s.queued === 'object';
		return {
			state: {
				...s,
				save: status === 409 ? 'conflict' : 'rejected',
				outcome: undefined,
				queued: undefined,
				switching: switchWaiting ? false : s.switching,
				switchFailed: switchWaiting ? true : s.switchFailed
			}
		};
	}

	if (!reply.ok && status === 503 && typeof reply.revision === 'number') {
		// The Build was saved before the Runner failed; the error carries the revision it saved.
		return follow(
			{
				...s,
				build: { ...s.build, revision: reply.revision },
				save: s.dirty ? 'edited' : 'saved',
				outcome: { kind: 'unavailable' }
			},
			false
		);
	}

	if (reply.ok) {
		const data = reply.data as { revision: number };
		const revision = data.revision;
		const settled: Session = {
			...s,
			build: { ...s.build, revision },
			save: s.dirty ? 'edited' : 'saved'
		};
		if (kind === 'run') {
			return follow(
				{ ...settled, outcome: { kind: 'result', view: reply.data as RunView } },
				false
			);
		}
		if (kind === 'submit') {
			return follow(
				{ ...settled, outcome: { kind: 'verdict', view: reply.data as SubmitView } },
				false
			);
		}
		return resume(settled);
	}

	// Network trouble or a 5xx: the code is still unsent; try again.
	const failed: Session = {
		...s,
		dirty: true,
		save: 'failed',
		outcome: wasAct ? undefined : s.outcome
	};
	const waiting = failed.queued;
	if (kind === 'save' && waiting !== undefined) {
		// Run or Submit save the Build themselves, so they go anyway; a switch does not.
		if (typeof waiting === 'object') {
			return { state: { ...failed, queued: undefined, switching: false, switchFailed: true } };
		}
		return sendBuild({ ...failed, queued: undefined }, waiting);
	}
	return follow(failed, true);
}
