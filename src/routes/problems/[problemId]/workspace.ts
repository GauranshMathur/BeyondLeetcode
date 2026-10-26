import type { Language } from '$lib/languages';
import type { Reply, ReplyData } from '$lib/problem-wire';
import type { BuildRef } from '$lib/server/learning/core';
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

/** `signedOut`: the session ended; the code stays in the editor and nothing is sent until the Learner signs in again. */
export type SaveState =
	| 'saved'
	| 'edited'
	| 'saving'
	| 'failed'
	| 'rejected'
	| 'conflict'
	| 'signedOut';
type Files = Record<string, string>;
type Act = 'run' | 'submit';

/** A request that got no reply: the server may or may not have committed it. */
type Unreplied = { kind: 'save'; files: Files } | { kind: 'restart' };

const sameFiles = (a: Files, b: Files) => {
	const paths = Object.keys(a);
	return (
		paths.length === Object.keys(b).length &&
		paths.every((path) => Object.hasOwn(b, path) && a[path] === b[path])
	);
};

/** What the machine asks the component to send. Save, Run and Submit all carry the Build and its reference. */
export type Request =
	| { kind: 'save' | Act; build: BuildRef; files: Files; keepalive?: true }
	| { kind: 'switch'; language: Language }
	/** Start from reference code: replaces the Build, so it carries the reference alone. */
	| { kind: 'restart'; build: BuildRef };

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
	/** Start from reference code is under way (editing and every other request wait). */
	readonly restarting: boolean;
	readonly restartFailed: boolean;
	/** How many times the Build was replaced by reference code: the editor starts over on each. */
	readonly restarts: number;
	/** The screen is being left: a failed save is not retried. */
	readonly closed: boolean;
	/** What is on the wire. */
	readonly inFlight?: Request['kind'];
	/** What waits for it. */
	readonly queued?: Act | 'restart' | { switchTo: Language };
	/** The files of the save, Run or Submit on the wire (or last sent), kept in case no reply comes. */
	readonly sent?: Files;
	/**
	 * The request that got no reply (network trouble or a 5xx) and may have committed. It is re-sent
	 * first, exactly as it was and with the same base revision, so a copy that did commit is answered
	 * as saved and newer edits then go out on the revision it reports. A Run or Submit is re-sent
	 * as a save, never as itself, so no Submission is recorded twice.
	 */
	readonly unreplied?: Unreplied;
}

export type Event =
	| { type: 'edit'; files: Files }
	| { type: 'tick' }
	| { type: 'run' }
	| { type: 'submit' }
	| { type: 'switch'; language: Language }
	| { type: 'restart' }
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
		restarting: false,
		restartFailed: false,
		restarts: 0,
		closed: false
	};
}

export const isBusy = (s: Session) =>
	s.outcome?.kind === 'running' || s.outcome?.kind === 'submitting';

/** Nothing is sent, and edits are not scheduled, until the Learner acts (reload, or sign in again). */
const halted = (s: Session) => s.save === 'conflict' || s.save === 'signedOut';
const blocked = (s: Session) => halted(s) || s.save === 'rejected';

/** Sends the request that got no reply again, as it was; `then` is what waits for its answer. */
function resend(s: Session, lost: Unreplied, then?: Session['queued']): Step {
	const queued = then ?? s.queued;
	if (lost.kind === 'restart') {
		return {
			state: {
				...s,
				restarting: true,
				restartFailed: false,
				dirty: false,
				inFlight: 'restart',
				queued
			},
			send: { kind: 'restart', build: s.build },
			timer: 'cancel'
		};
	}
	return {
		state: {
			...s,
			dirty: !sameFiles(s.files, lost.files),
			save: 'saving',
			inFlight: 'save',
			sent: lost.files,
			queued
		},
		send: { kind: 'save', build: s.build, files: lost.files },
		timer: 'cancel'
	};
}

/** Sends `kind` now with the latest code, which saves it too (first re-sending what got no reply). */
function sendBuild(s: Session, kind: 'save' | Act, keepalive = false): Step {
	if (s.unreplied) {
		const step = resend(s, s.unreplied, kind === 'save' ? undefined : kind);
		return keepalive && step.send?.kind === 'save'
			? { ...step, send: { ...step.send, keepalive: true } }
			: step;
	}
	return {
		state: { ...s, dirty: false, save: 'saving', inFlight: kind, sent: s.files },
		send: { kind, build: s.build, files: s.files, ...(keepalive && { keepalive: true as const }) },
		timer: 'cancel'
	};
}

/** Sends the reference request; edits not yet sent are replaced with the rest of the Build. */
function sendRestart(s: Session): Step {
	// A save that got no reply may have moved the revision: it goes first, the restart follows on its revision.
	if (s.unreplied?.kind === 'save') return resend(s, s.unreplied, 'restart');
	return {
		state: { ...s, dirty: false, inFlight: 'restart', queued: undefined },
		send: { kind: 'restart', build: s.build },
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
			if (s.save === 'conflict' || s.restarting) return { state: s };
			// Signed out: the code is kept for the Learner, but nothing is scheduled.
			if (s.save === 'signedOut') return { state: { ...s, files: event.files, dirty: true } };
			return {
				state: { ...s, files: event.files, dirty: true, save: 'edited' },
				timer: { afterMs: SAVE_DELAY_MS }
			};

		case 'tick':
			if (s.inFlight || !s.dirty || halted(s) || s.switching) return { state: s };
			// A restart that got no reply keeps the editor locked and is re-sent here, as a restart.
			if (s.restarting) return s.unreplied ? resend(s, s.unreplied) : { state: s };
			return sendBuild(s, 'save');

		case 'run':
		case 'submit': {
			if (isBusy(s) || blocked(s) || s.switching || s.restarting) return { state: s };
			const pending = {
				...s,
				outcome: { kind: event.type === 'run' ? 'running' : 'submitting' } as Outcome
			};
			// An autosave is on the wire: this must carry the revision it produces, so it waits.
			if (s.inFlight) return { state: { ...pending, queued: event.type }, timer: 'cancel' };
			return sendBuild(pending, event.type);
		}

		case 'switch': {
			if (isBusy(s) || s.switching || s.restarting || event.language === s.build.language)
				return { state: s };
			const next = { ...s, switching: true, switchFailed: false };
			if (s.inFlight)
				return { state: { ...next, queued: { switchTo: event.language } }, timer: 'cancel' };
			return { ...continueSwitch(next, event.language), timer: 'cancel' };
		}

		case 'restart': {
			// Not in conflict (reload first) or signed out; a rejected save is the very case it is for.
			if (isBusy(s) || halted(s) || s.switching || s.restarting) return { state: s };
			const next = { ...s, restarting: true, restartFailed: false };
			// An autosave is on the wire: this must carry the revision it produces, so it waits.
			if (s.inFlight) return { state: { ...next, queued: 'restart' }, timer: 'cancel' };
			return sendRestart(next);
		}

		case 'flush': {
			const closed = s.closed || event.final;
			if (s.inFlight || !s.dirty || halted(s) || s.restarting) {
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
function answered(before: Session, kind: Request['kind'], reply: Reply): Step {
	// Any answer settles what had got no reply; only trouble without an answer (below) sets it again.
	const s: Session = { ...before, unreplied: undefined };
	const wasAct = kind === 'run' || kind === 'submit';
	const refused = !reply.ok && reply.kind === 'refused' ? reply : undefined;
	const restartWaiting = s.queued === 'restart';

	if (!reply.ok && reply.kind === 'signedOut') {
		// The session ended: keep every unsent character, stop sending, and say so.
		return {
			state: {
				...s,
				save: 'signedOut',
				dirty: s.dirty || kind === 'save' || kind === 'restart' || wasAct,
				outcome: undefined,
				queued: undefined,
				switching: false,
				switchFailed: kind === 'switch' || typeof s.queued === 'object',
				restarting: false,
				restartFailed: kind === 'restart' || restartWaiting
			},
			timer: 'cancel'
		};
	}

	if (kind === 'switch') {
		// A switch that went through reloads the screen; either way it is no longer under way.
		return { state: { ...s, switching: false, switchFailed: !reply.ok } };
	}

	// What waited for a save: Run or Submit go out with the new revision; a switch or a restart goes on.
	const resume = (after: Session): Step => {
		const waiting = after.queued;
		if (waiting === undefined) return follow(after, false);
		if (waiting === 'restart') return sendRestart(after);
		if (typeof waiting === 'object')
			return continueSwitch({ ...after, queued: undefined }, waiting.switchTo);
		return sendBuild({ ...after, queued: undefined }, waiting);
	};

	/** What waited for a save whose re-send failed too gives up: Run and Submit show no result, a switch fails. */
	const dropQueued = (after: Session): Session => {
		const waiting = after.queued;
		const switchWaiting = typeof waiting === 'object';
		return {
			...after,
			queued: undefined,
			outcome: waiting === 'run' || waiting === 'submit' ? undefined : after.outcome,
			switching: switchWaiting ? false : after.switching,
			switchFailed: switchWaiting ? true : after.switchFailed,
			restarting: waiting === 'restart' ? false : after.restarting,
			restartFailed: waiting === 'restart' ? true : after.restartFailed
		};
	};

	if (kind === 'restart') {
		if (reply.ok) {
			const { files, revision } = reply.data as ReplyData['startFromReferenceCode'];
			return {
				state: {
					...s,
					files: { ...files },
					build: { ...s.build, revision },
					save: 'saved',
					dirty: false,
					outcome: undefined,
					restarting: false,
					restartFailed: false,
					restarts: s.restarts + 1
				}
			};
		}
		if (refused) {
			return {
				state: {
					...s,
					save: refused.code === 'RevisionConflict' ? 'conflict' : s.save,
					restarting: false,
					restartFailed: true,
					dirty: refused.code === 'RevisionConflict' ? s.dirty : true
				}
			};
		}
		// Network trouble or a 5xx: it may have committed, so the next try is a restart again, not a
		// save of the old code. The editor stays locked meanwhile, so no edit is overwritten by the reply.
		return follow(
			{
				...s,
				dirty: true,
				save: 'failed',
				restartFailed: true,
				unreplied: { kind: 'restart' }
			},
			true
		);
	}

	if (refused && refused.code !== 'RunnerUnavailable') {
		// RevisionConflict: the Build moved on (another tab, a switched Language). Anything else the server will never accept.
		const switchWaiting = typeof s.queued === 'object';
		return {
			state: {
				...s,
				save: refused.code === 'RevisionConflict' ? 'conflict' : 'rejected',
				outcome: undefined,
				queued: undefined,
				switching: switchWaiting ? false : s.switching,
				switchFailed: switchWaiting ? true : s.switchFailed,
				restarting: restartWaiting ? false : s.restarting,
				restartFailed: restartWaiting ? true : s.restartFailed
			}
		};
	}

	if (refused && typeof refused.revision === 'number') {
		// The Build was saved before the Runner failed; the refusal carries the revision it saved.
		return follow(
			{
				...s,
				build: { ...s.build, revision: refused.revision },
				save: s.dirty ? 'edited' : 'saved',
				outcome: { kind: 'unavailable' }
			},
			false
		);
	}

	if (reply.ok) {
		const { revision } = reply.data as ReplyData['save'];
		const settled: Session = {
			...s,
			build: { ...s.build, revision },
			save: s.dirty ? 'edited' : 'saved'
		};
		if (kind === 'run') {
			return follow(
				{ ...settled, outcome: { kind: 'result', view: reply.data as ReplyData['run'] } },
				false
			);
		}
		if (kind === 'submit') {
			return follow(
				{ ...settled, outcome: { kind: 'verdict', view: reply.data as ReplyData['submit'] } },
				false
			);
		}
		return resume(settled);
	}

	// Network trouble or a 5xx: the code is still unsent; try again.
	// It may have committed: the next try re-sends these very files with this base (a Run or Submit as a save).
	const failed: Session = {
		...s,
		dirty: true,
		save: 'failed',
		outcome: wasAct ? undefined : s.outcome,
		unreplied: { kind: 'save', files: s.sent ?? s.files }
	};
	const waiting = failed.queued;
	if (kind === 'save' && waiting !== undefined && before.unreplied) {
		// The re-send failed too: what waited for it gives up, and the re-send is tried again on the retry timer.
		return follow(dropQueued(failed), true);
	}
	if (kind === 'save' && waiting !== undefined) {
		// Run or Submit save the Build themselves, so they go anyway; a switch does not.
		if (waiting === 'restart') return sendRestart(failed);
		if (typeof waiting === 'object') {
			return follow({ ...failed, queued: undefined, switching: false, switchFailed: true }, true);
		}
		return sendBuild({ ...failed, queued: undefined }, waiting);
	}
	return follow(failed, true);
}
