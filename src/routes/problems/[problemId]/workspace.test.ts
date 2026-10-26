import { describe, expect, it } from 'vitest';
import type { Reply, WireCode } from '#lib/problem-wire.js';
import type { BuildRef, RunView, SubmitView } from '#lib/server/learning/core.js';
import {
	begin,
	type Event,
	RETRY_DELAY_MS,
	SAVE_DELAY_MS,
	type Session,
	type Step,
	transition
} from './workspace';

const build: BuildRef = { problemId: 'stacks-push', language: 'python', revision: 3 };
const runView = { revision: 5, tests: [] } as RunView;
const submitView = { revision: 5, verdict: 'Accepted' } as unknown as SubmitView;

const ok = (data: unknown): Reply => ({ ok: true, data });
const refused = (code: WireCode, revision?: number): Reply => ({
	ok: false,
	kind: 'refused',
	code,
	...(revision !== undefined && { revision })
});
const unreachable: Reply = { ok: false, kind: 'unreachable' };
const signedOut: Reply = { ok: false, kind: 'signedOut' };
/** The answer an HTTP status stood for before the contract carried codes. */
const fail = (status: number, revision?: number): Reply =>
	status === 409
		? refused('RevisionConflict')
		: status === 400
			? refused('InvalidBuild')
			: status === 503 && revision !== undefined
				? refused('RunnerUnavailable', revision)
				: unreachable;
const respond = (reply: Reply): Event => ({ type: 'response', reply });

/** Plays events against a session, returning the final step and every request sent on the way. */
function play(start: Session, ...events: Event[]) {
	let step: Step = { state: start };
	const sent: NonNullable<Step['send']>[] = [];
	for (const event of events) {
		step = transition(step.state, event);
		if (step.send) sent.push(step.send);
	}
	return { step, state: step.state, sent };
}

const fresh = () => begin(build, { 'main.py': 'a' });
const edited = (files = { 'main.py': 'b' }) => play(fresh(), { type: 'edit', files }).state;

describe('editing and autosave', () => {
	it('marks an edit and arms the autosave timer', () => {
		const { step } = play(fresh(), { type: 'edit', files: { 'main.py': 'b' } });
		expect(step.state).toMatchObject({ save: 'edited', dirty: true, files: { 'main.py': 'b' } });
		expect(step.timer).toEqual({ afterMs: SAVE_DELAY_MS });
	});

	it('sends the whole Build and its reference on a tick, and takes the new revision from the reply', () => {
		const { sent, state } = play(edited(), { type: 'tick' });
		expect(sent).toEqual([{ kind: 'save', build, files: { 'main.py': 'b' } }]);
		expect(state).toMatchObject({ save: 'saving', dirty: false, inFlight: 'save' });

		const done = play(state, respond(ok({ revision: 4 }))).state;
		expect(done).toMatchObject({ save: 'saved', build: { ...build, revision: 4 } });
		expect(done.inFlight).toBeUndefined();
	});

	it('does nothing on a tick with nothing to send or a request already out', () => {
		expect(play(fresh(), { type: 'tick' }).sent).toEqual([]);
		expect(
			play(
				edited(),
				{ type: 'tick' },
				{ type: 'edit', files: { 'main.py': 'c' } },
				{ type: 'tick' }
			).sent
		).toHaveLength(1);
	});

	it('sends edits made while saving on the next tick, straight away', () => {
		const { step } = play(
			edited(),
			{ type: 'tick' },
			{ type: 'edit', files: { 'main.py': 'c' } },
			respond(ok({ revision: 4 }))
		);
		expect(step.state).toMatchObject({ save: 'edited', dirty: true });
		expect(step.timer).toEqual({ afterMs: 0 });
	});

	it('ignores edits once the Build is in conflict', () => {
		const conflicted = play(edited(), { type: 'tick' }, respond(fail(409))).state;
		const { state } = play(conflicted, { type: 'edit', files: { 'main.py': 'z' } });
		expect(state.files).toEqual({ 'main.py': 'b' });
		expect(state.save).toBe('conflict');
	});
});

describe('a save the server answers with a failure', () => {
	it('rejected (4xx): stops, never retries, and an edit starts it again', () => {
		const { step } = play(edited(), { type: 'tick' }, respond(fail(400)));
		expect(step.state).toMatchObject({ save: 'rejected', dirty: false });
		expect(step.timer).toBeUndefined();

		const again = transition(step.state, { type: 'edit', files: { 'main.py': 'smaller' } });
		expect(again.state.save).toBe('edited');
		expect(again.timer).toEqual({ afterMs: SAVE_DELAY_MS });
	});

	it('conflict (409): stops, never retries', () => {
		const { step } = play(edited(), { type: 'tick' }, respond(fail(409)));
		expect(step.state.save).toBe('conflict');
		expect(step.timer).toBeUndefined();
	});

	it('failed (5xx or no answer): keeps the code unsent and retries later', () => {
		for (const status of [500, 0]) {
			const { step } = play(edited(), { type: 'tick' }, respond(fail(status)));
			expect(step.state).toMatchObject({ save: 'failed', dirty: true });
			expect(step.timer).toEqual({ afterMs: RETRY_DELAY_MS });
		}
	});

	it('retry: the tick after a failure sends the same code again with the same revision', () => {
		const { sent, state } = play(
			edited(),
			{ type: 'tick' },
			respond(fail(500)),
			{ type: 'tick' },
			respond(ok({ revision: 4 }))
		);
		expect(sent).toHaveLength(2);
		expect(sent[1]).toEqual(sent[0]);
		expect(state).toMatchObject({ save: 'saved', build: { revision: 4 } });
	});

	it('does not retry once the screen is closed', () => {
		const { step } = play(
			edited(),
			{ type: 'tick' },
			{ type: 'flush', final: true },
			respond(fail(500))
		);
		expect(step.state.save).toBe('failed');
		expect(step.timer).toBeUndefined();
	});
});

describe('Run and Submit', () => {
	it('save the Build themselves and show the result with its revision', () => {
		const run = play(edited(), { type: 'run' });
		expect(run.sent).toEqual([{ kind: 'run', build, files: { 'main.py': 'b' } }]);
		expect(run.state.outcome).toEqual({ kind: 'running' });

		const done = play(run.state, respond(ok(runView))).state;
		expect(done).toMatchObject({
			outcome: { kind: 'result', view: runView },
			save: 'saved',
			build: { revision: 5 }
		});

		const submit = play(fresh(), { type: 'submit' }, respond(ok(submitView))).state;
		expect(submit.outcome).toEqual({ kind: 'verdict', view: submitView });
	});

	it('ignore a second Run or Submit while one is under way', () => {
		const { sent } = play(fresh(), { type: 'run' }, { type: 'run' }, { type: 'submit' });
		expect(sent).toHaveLength(1);
	});

	it('wait for an autosave on the wire, then go out with the revision it produced', () => {
		const saving = play(edited(), { type: 'tick' });
		const run = play(saving.state, { type: 'edit', files: { 'main.py': 'c' } }, { type: 'run' });
		expect(run.sent).toEqual([]);
		expect(run.state.outcome).toEqual({ kind: 'running' });
		expect(run.step.timer).toBe('cancel');

		const { step, sent } = play(run.state, respond(ok({ revision: 4 })));
		expect(step.send).toEqual({
			kind: 'run',
			build: { ...build, revision: 4 },
			files: { 'main.py': 'c' }
		});
		expect(sent).toHaveLength(1);
		expect(step.state).toMatchObject({ inFlight: 'run', dirty: false });
	});

	it('still go out when the autosave they waited for failed (they save the Build themselves)', () => {
		// The failed autosave may have committed, so it is re-sent first; the submit goes out on its answer.
		const run = play(
			edited(),
			{ type: 'tick' },
			{ type: 'submit' },
			respond(fail(500)),
			respond(ok({ revision: 4 }))
		);
		expect(run.sent.map((r) => r.kind)).toEqual(['save', 'save', 'submit']);
		expect(run.sent[2]).toMatchObject({
			build: { ...build, revision: 4 },
			files: { 'main.py': 'b' }
		});
	});

	it('are dropped when the autosave they waited for shows the Build is in conflict or rejected', () => {
		for (const status of [409, 400]) {
			const { step, sent } = play(
				edited(),
				{ type: 'tick' },
				{ type: 'run' },
				respond(fail(status))
			);
			expect(sent.map((r) => r.kind)).toEqual(['save']);
			expect(step.state.outcome).toBeUndefined();
			expect(step.state.save).toBe(status === 409 ? 'conflict' : 'rejected');
		}
	});

	it('are refused once the Build is in conflict or rejected', () => {
		const conflict = play(edited(), { type: 'tick' }, respond(fail(409))).state;
		expect(play(conflict, { type: 'run' }, { type: 'submit' }).sent).toEqual([]);
		const rejected = play(edited(), { type: 'tick' }, respond(fail(400))).state;
		expect(play(rejected, { type: 'run' }).sent).toEqual([]);
	});

	it('Runner unavailable (503): shows it, and carries on from the revision the save produced', () => {
		const { state } = play(edited(), { type: 'submit' }, respond(fail(503, 4)));
		expect(state).toMatchObject({
			outcome: { kind: 'unavailable' },
			save: 'saved',
			build: { revision: 4 }
		});
		expect(
			play(state, { type: 'edit', files: { 'main.py': 'c' } }, { type: 'tick' }).sent[0]
		).toMatchObject({
			build: { revision: 4 }
		});
	});

	it('Runner unavailable with edits made meanwhile: they go out next', () => {
		const { step } = play(
			fresh(),
			{ type: 'run' },
			{ type: 'edit', files: { 'main.py': 'c' } },
			respond(fail(503, 4))
		);
		expect(step.state).toMatchObject({ save: 'edited', outcome: { kind: 'unavailable' } });
		expect(step.timer).toEqual({ afterMs: 0 });
	});

	it('stale Language (409): shows the Build moved on and no result', () => {
		for (const act of ['run', 'submit'] as const) {
			const { state } = play(fresh(), { type: act }, respond(fail(409)));
			expect(state).toMatchObject({ save: 'conflict', outcome: undefined });
			expect(state.inFlight).toBeUndefined();
		}
	});

	it('rejected (4xx): no result and no retry', () => {
		const { step } = play(fresh(), { type: 'run' }, respond(fail(400)));
		expect(step.state).toMatchObject({ save: 'rejected', outcome: undefined });
		expect(step.timer).toBeUndefined();
	});

	it('failed: no result, the code stays unsent and is retried', () => {
		const { step } = play(fresh(), { type: 'run' }, respond(fail(500)));
		expect(step.state).toMatchObject({ save: 'failed', dirty: true, outcome: undefined });
		expect(step.timer).toEqual({ afterMs: RETRY_DELAY_MS });
	});
});

describe('switching Language', () => {
	it('sends what is unsent first, then switches', () => {
		const first = play(edited(), { type: 'switch', language: 'go' });
		expect(first.sent).toEqual([{ kind: 'save', build, files: { 'main.py': 'b' } }]);
		expect(first.state).toMatchObject({ switching: true });

		const next = transition(first.state, respond(ok({ revision: 4 })));
		expect(next.send).toEqual({ kind: 'switch', language: 'go' });

		const done = transition(next.state, respond(ok({ language: 'go' }))).state;
		expect(done).toMatchObject({ switching: false, switchFailed: false });
	});

	it('switches at once when nothing is unsent', () => {
		expect(play(fresh(), { type: 'switch', language: 'go' }).sent).toEqual([
			{ kind: 'switch', language: 'go' }
		]);
	});

	it('waits for an autosave on the wire, then sends what is still unsent, then switches', () => {
		const { sent, state } = play(
			edited(),
			{ type: 'tick' },
			{ type: 'switch', language: 'go' },
			respond(ok({ revision: 4 }))
		);
		expect(sent.map((r) => r.kind)).toEqual(['save', 'switch']);
		expect(state.inFlight).toBe('switch');
	});

	it('fails when the save before it fails, and does not switch', () => {
		const { state, sent } = play(edited(), { type: 'switch', language: 'go' }, respond(fail(500)));
		expect(sent.map((r) => r.kind)).toEqual(['save']);
		expect(state).toMatchObject({ switching: false, switchFailed: true });
	});

	it('keeps retrying the unsent code after the save before a switch failed', () => {
		const { step } = play(edited(), { type: 'switch', language: 'go' }, respond(fail(500)));
		expect(step.timer).toEqual({ afterMs: RETRY_DELAY_MS });
	});

	it('fails when the save before it is in conflict or rejected', () => {
		for (const status of [409, 400]) {
			const { state, sent } = play(
				edited(),
				{ type: 'switch', language: 'go' },
				respond(fail(status))
			);
			expect(sent.map((r) => r.kind)).toEqual(['save']);
			expect(state).toMatchObject({ switching: false, switchFailed: true });
		}
	});

	it('fails when the switch request fails, and can be tried again', () => {
		const failed = play(fresh(), { type: 'switch', language: 'go' }, respond(fail(500))).state;
		expect(failed).toMatchObject({ switching: false, switchFailed: true });
		const again = play(failed, { type: 'switch', language: 'go' });
		expect(again.sent).toEqual([{ kind: 'switch', language: 'go' }]);
		expect(again.state.switchFailed).toBe(false);
	});

	it('is ignored while Run or Submit is under way, or to the Language already shown', () => {
		expect(
			play(fresh(), { type: 'run' }, { type: 'switch', language: 'go' }).sent.map((r) => r.kind)
		).toEqual(['run']);
		expect(play(fresh(), { type: 'switch', language: 'python' }).sent).toEqual([]);
	});

	it('holds Run and Submit off while it is under way, so none lands in the new Language', () => {
		const { sent } = play(
			fresh(),
			{ type: 'switch', language: 'go' },
			{ type: 'run' },
			{ type: 'submit' }
		);
		expect(sent.map((r) => r.kind)).toEqual(['switch']);
	});

	it('holds the autosave off while it is under way', () => {
		const { sent } = play(edited(), { type: 'switch', language: 'go' }, { type: 'tick' });
		expect(sent.map((r) => r.kind)).toEqual(['save']);
	});
});

describe('leaving the page', () => {
	it('sends what is unsent with keepalive and stops the timer', () => {
		const { step } = play(edited(), { type: 'flush', final: false });
		expect(step.send).toEqual({ kind: 'save', build, files: { 'main.py': 'b' }, keepalive: true });
		expect(step.timer).toBe('cancel');
		expect(step.state.closed).toBe(false);
	});

	it('sends nothing when nothing is unsent, or a request is out or the Build is in conflict', () => {
		expect(play(fresh(), { type: 'flush', final: true }).sent).toEqual([]);
		expect(play(edited(), { type: 'tick' }, { type: 'flush', final: true }).sent).toHaveLength(1);
		const conflict = play(edited(), { type: 'tick' }, respond(fail(409)), {
			type: 'flush',
			final: true
		});
		expect(conflict.sent).toHaveLength(1);
	});

	it('still sends edits that arrived during a save, once, after a final flush', () => {
		const { step } = play(
			edited(),
			{ type: 'tick' },
			{ type: 'edit', files: { 'main.py': 'c' } },
			{ type: 'flush', final: true },
			respond(ok({ revision: 4 }))
		);
		expect(step.state.closed).toBe(true);
		expect(step.timer).toEqual({ afterMs: 0 });
	});
});

describe('leaving the page while a save is on the wire (C69)', () => {
	const onWire = () =>
		play(
			edited(),
			{ type: 'tick' },
			{ type: 'digest', of: { 'main.py': 'b' }, digest: 'D-b' },
			{ type: 'edit', files: { 'main.py': 'c' } }
		);

	it('sends the latest files as a keepalive save carrying the digest of the save in flight, on the same base', () => {
		const { step } = play(onWire().state, { type: 'flush', final: true });
		expect(step.send).toEqual({
			kind: 'save',
			build,
			files: { 'main.py': 'c' },
			keepalive: true,
			inflightDigest: 'D-b'
		});
		expect(step.state).toMatchObject({ closed: true, dirty: true });
		expect(step.timer).toBe('cancel');
	});

	it('sends it once, however many times the page reports leaving', () => {
		const { sent } = play(
			onWire().state,
			{ type: 'flush', final: false },
			{ type: 'flush', final: true }
		);
		expect(sent).toHaveLength(1);
	});

	it('sends nothing when the digest is not computed yet, or the edits are already on the wire', () => {
		const undigested = play(
			edited(),
			{ type: 'tick' },
			{ type: 'edit', files: { 'main.py': 'c' } }
		);
		expect(play(undigested.state, { type: 'flush', final: true }).sent).toEqual([]);
		const sameAsSent = play(
			edited(),
			{ type: 'tick' },
			{ type: 'digest', of: { 'main.py': 'b' }, digest: 'D-b' }
		);
		expect(play(sameAsSent.state, { type: 'flush', final: true }).sent).toEqual([]);
	});

	it('ignores a digest of files that are not the ones in flight', () => {
		const { state } = play(
			edited(),
			{ type: 'tick' },
			{ type: 'digest', of: { 'main.py': 'zzz' }, digest: 'D-z' }
		);
		expect(state.sentDigest).toBeUndefined();
	});

	it('forgets the digest once the save is answered, and sends the unconfirmed edits on the new revision', () => {
		const { step } = play(onWire().state, respond(ok({ revision: 4 })));
		expect(step.state.sentDigest).toBeUndefined();
		expect(step.state.build.revision).toBe(4);
		expect(step.timer).toEqual({ afterMs: 0 });
	});
});

it('ignores an answer when nothing is on the wire', () => {
	const { state, sent } = play(fresh(), respond(ok({ revision: 9 })));
	expect(state).toEqual(fresh());
	expect(sent).toEqual([]);
});

describe('a session that ended (401 or a redirect)', () => {
	const out = () => play(edited(), { type: 'tick' }, respond(signedOut));

	it('stops: the code stays in the editor, nothing is retried, no timer runs', () => {
		const { step } = out();
		expect(step.state).toMatchObject({
			save: 'signedOut',
			dirty: true,
			files: { 'main.py': 'b' },
			inFlight: undefined
		});
		expect(step.timer).toBe('cancel');
	});

	it('keeps later edits without scheduling a save, and sends nothing on a tick, flush or Run', () => {
		const { state, sent } = play(
			out().state,
			{ type: 'edit', files: { 'main.py': 'c' } },
			{ type: 'tick' },
			{ type: 'flush', final: false },
			{ type: 'run' },
			{ type: 'submit' },
			{ type: 'switch', language: 'go' }
		);
		expect(sent).toEqual([]);
		expect(state).toMatchObject({ save: 'signedOut', files: { 'main.py': 'c' }, dirty: true });
		expect(
			transition(out().state, { type: 'edit', files: { 'main.py': 'c' } }).timer
		).toBeUndefined();
	});

	it('ends a Run or Submit that was out, with no result and no retry', () => {
		for (const act of ['run', 'submit'] as const) {
			const { step } = play(fresh(), { type: act }, respond(signedOut));
			expect(step.state).toMatchObject({ save: 'signedOut', outcome: undefined, dirty: true });
			expect(step.timer).toBe('cancel');
		}
	});

	it('ends a Language switch that was under way, and one that waited for the autosave', () => {
		const direct = play(fresh(), { type: 'switch', language: 'go' }, respond(signedOut)).state;
		expect(direct).toMatchObject({ switching: false, switchFailed: true, save: 'signedOut' });

		const waiting = play(
			edited(),
			{ type: 'tick' },
			{ type: 'switch', language: 'go' },
			respond(signedOut)
		);
		expect(waiting.sent.map((r) => r.kind)).toEqual(['save']);
		expect(waiting.state).toMatchObject({
			switching: false,
			switchFailed: true,
			queued: undefined
		});
	});
});

describe('each core code reaches the machine as itself', () => {
	const saved = (reply: Reply) => play(edited(), { type: 'tick' }, respond(reply)).state;

	it.each([
		['RevisionConflict', 'conflict'],
		['NotFound', 'rejected'],
		['TopicLocked', 'rejected'],
		['InvalidBuild', 'rejected'],
		['BadRequest', 'rejected']
	] as const)('%s on a save is %s', (code, save) => {
		expect(saved(refused(code)).save).toBe(save);
	});

	it('RunnerUnavailable carries the saved revision; without one it is a failure to retry', () => {
		const { state } = play(edited(), { type: 'submit' }, respond(refused('RunnerUnavailable', 4)));
		expect(state).toMatchObject({ outcome: { kind: 'unavailable' }, build: { revision: 4 } });
		expect(saved(refused('RunnerUnavailable')).save).toBe('failed');
	});
});

describe('starting from reference code', () => {
	const started = { files: { 'main.py': 'ref' }, revision: 9 };

	it('sends the reference alone, drops unsent edits, and takes the files and revision from the reply', () => {
		const { sent, state } = play(edited(), { type: 'restart' });
		expect(sent).toEqual([{ kind: 'restart', build }]);
		expect(state).toMatchObject({ restarting: true, inFlight: 'restart', dirty: false });

		const done = play(state, respond(ok(started))).state;
		expect(done).toMatchObject({
			files: { 'main.py': 'ref' },
			build: { ...build, revision: 9 },
			save: 'saved',
			dirty: false,
			restarting: false,
			restartFailed: false,
			restarts: 1
		});
	});

	it('waits for an autosave on the wire so it carries the revision that save produces', () => {
		const { sent, state } = play(
			edited(),
			{ type: 'tick' },
			{ type: 'restart' },
			respond(ok({ revision: 4 }))
		);
		expect(sent.map((r) => r.kind)).toEqual(['save', 'restart']);
		expect(sent[1]).toEqual({ kind: 'restart', build: { ...build, revision: 4 } });
		expect(state.restarting).toBe(true);
	});

	it('holds Run, Submit, switch, edits and ticks while it is under way, and is ignored while they are', () => {
		const { sent } = play(
			fresh(),
			{ type: 'restart' },
			{ type: 'run' },
			{ type: 'submit' },
			{ type: 'switch', language: 'go' },
			{ type: 'restart' },
			{ type: 'edit', files: { 'main.py': 'z' } },
			{ type: 'tick' }
		);
		expect(sent.map((r) => r.kind)).toEqual(['restart']);
		expect(play(fresh(), { type: 'run' }, { type: 'restart' }).sent.map((r) => r.kind)).toEqual([
			'run'
		]);
	});

	it('a conflict ends it and shows the conflict; other refusals leave the Learner code and say it failed', () => {
		const conflict = play(fresh(), { type: 'restart' }, respond(refused('RevisionConflict'))).state;
		expect(conflict).toMatchObject({ save: 'conflict', restarting: false, restartFailed: true });

		const failed = play(edited(), { type: 'restart' }, respond(unreachable));
		expect(failed.state).toMatchObject({
			restarting: true,
			restartFailed: true,
			files: { 'main.py': 'b' },
			dirty: true,
			save: 'failed'
		});
		expect(failed.step.timer).toEqual({ afterMs: RETRY_DELAY_MS });
	});

	it('is dropped when the autosave it waited for is refused or the session ended', () => {
		const rejected = play(
			edited(),
			{ type: 'tick' },
			{ type: 'restart' },
			respond(refused('InvalidBuild'))
		);
		expect(rejected.sent.map((r) => r.kind)).toEqual(['save']);
		expect(rejected.state).toMatchObject({
			restarting: false,
			restartFailed: true,
			queued: undefined
		});

		const out = play(fresh(), { type: 'restart' }, respond(signedOut)).state;
		expect(out).toMatchObject({ save: 'signedOut', restarting: false, restartFailed: true });
		expect(play(out, { type: 'restart' }).sent).toEqual([]);
	});

	it('is allowed after a rejected save: it is the way out', () => {
		const rejected = play(edited(), { type: 'tick' }, respond(refused('InvalidBuild'))).state;
		expect(play(rejected, { type: 'restart' }).sent.map((r) => r.kind)).toEqual(['restart']);
	});

	it('is refused in conflict', () => {
		const conflict = play(edited(), { type: 'tick' }, respond(refused('RevisionConflict'))).state;
		expect(play(conflict, { type: 'restart' }).sent).toEqual([]);
	});
});

describe('a request that got no reply (it may have committed)', () => {
	const rev = (n: number) => ({ ...build, revision: n });

	it('re-sends exactly the files that were sent, with the same base, then the newer edits on the new revision', () => {
		const { sent, state } = play(
			edited({ 'main.py': 'b' }),
			{ type: 'tick' },
			{ type: 'edit', files: { 'main.py': 'c' } },
			respond(unreachable),
			{ type: 'tick' }
		);
		expect(sent).toHaveLength(2);
		expect(sent[1]).toEqual({ kind: 'save', build: rev(3), files: { 'main.py': 'b' } });
		expect(state).toMatchObject({ inFlight: 'save', dirty: true });

		const next = play(state, respond(ok({ revision: 4 })), { type: 'tick' });
		expect(next.state).toMatchObject({ inFlight: 'save', build: rev(4) });
		expect(next.sent).toEqual([{ kind: 'save', build: rev(4), files: { 'main.py': 'c' } }]);
	});

	it('keeps re-sending the same files while the retry gets no reply either', () => {
		const { sent } = play(
			edited({ 'main.py': 'b' }),
			{ type: 'tick' },
			{ type: 'edit', files: { 'main.py': 'c' } },
			respond(unreachable),
			{ type: 'tick' },
			respond(fail(500)),
			{ type: 'tick' }
		);
		expect(sent.map((r) => r.kind === 'save' && [r.build.revision, r.files['main.py']])).toEqual([
			[3, 'b'],
			[3, 'b'],
			[3, 'b']
		]);
	});

	it('is settled by a landed retry: no leftover, saved when nothing newer', () => {
		const { state } = play(
			edited(),
			{ type: 'tick' },
			respond(unreachable),
			{ type: 'tick' },
			respond(ok({ revision: 4 }))
		);
		expect(state).toMatchObject({ save: 'saved', dirty: false, build: rev(4) });
		expect(play(state, { type: 'edit', files: { 'main.py': 'z' } }, { type: 'tick' }).sent).toEqual(
			[{ kind: 'save', build: rev(4), files: { 'main.py': 'z' } }]
		);
	});

	it('a refusal of the retry is a conflict as before', () => {
		const { state } = play(
			edited(),
			{ type: 'tick' },
			respond(unreachable),
			{ type: 'tick' },
			respond(fail(409))
		);
		expect(state.save).toBe('conflict');
	});

	it('Run and Submit wait for the re-sent save, then go out on the revision it reports', () => {
		for (const act of ['run', 'submit'] as const) {
			const { sent } = play(
				edited({ 'main.py': 'b' }),
				{ type: 'tick' },
				{ type: 'edit', files: { 'main.py': 'c' } },
				respond(unreachable),
				{ type: act },
				respond(ok({ revision: 4 }))
			);
			expect(sent).toEqual([
				{ kind: 'save', build: rev(3), files: { 'main.py': 'b' } },
				{ kind: 'save', build: rev(3), files: { 'main.py': 'b' } },
				{ kind: act, build: rev(4), files: { 'main.py': 'c' } }
			]);
		}
	});

	it('a Run or Submit that got no reply is retried as a save, never as a Run or Submit', () => {
		for (const act of ['run', 'submit'] as const) {
			const lost = play(edited(), { type: act }, respond(unreachable), { type: 'tick' });
			expect(lost.sent.map((r) => r.kind)).toEqual([act, 'save']);
			expect(lost.sent[1]).toEqual({ kind: 'save', build: rev(3), files: { 'main.py': 'b' } });
			const done = play(lost.state, respond(ok({ revision: 4 }))).state;
			expect(done).toMatchObject({ save: 'saved', outcome: undefined });
			expect(play(done, { type: 'tick' }).sent).toEqual([]);
		}
	});

	it('a lost restart is retried as a restart, not as a save of the old code', () => {
		const { sent, state } = play(edited(), { type: 'restart' }, respond(unreachable), {
			type: 'tick'
		});
		expect(sent).toEqual([
			{ kind: 'restart', build },
			{ kind: 'restart', build }
		]);
		expect(state).toMatchObject({ restarting: true, inFlight: 'restart' });

		const done = play(state, respond(ok({ files: { 'main.py': 'ref' }, revision: 4 }))).state;
		expect(done).toMatchObject({
			files: { 'main.py': 'ref' },
			build: rev(4),
			save: 'saved',
			dirty: false,
			restarting: false,
			restarts: 1
		});
	});

	it('keeps the editor locked after a lost restart, so no edit is overwritten by the re-sent restart', () => {
		const { sent, state } = play(
			fresh(),
			{ type: 'restart' },
			respond(unreachable),
			{ type: 'edit', files: { 'main.py': 'typed' } },
			{ type: 'run' },
			{ type: 'switch', language: 'go' },
			{ type: 'tick' }
		);
		expect(state).toMatchObject({ restarting: true, files: { 'main.py': 'a' } });
		expect(sent.map((r) => r.kind)).toEqual(['restart', 'restart']);
	});

	it('a non-final flush leaves the retry timer of a lost restart running', () => {
		const { step } = play(fresh(), { type: 'restart' }, respond(unreachable), {
			type: 'flush',
			final: false
		});
		expect(step.timer).toBeUndefined();
		expect(step.send).toBeUndefined();
	});

	it('a restart asked after a lost save waits for that save to be re-sent, then restarts on its revision', () => {
		const { sent } = play(
			edited(),
			{ type: 'tick' },
			respond(unreachable),
			{ type: 'restart' },
			respond(ok({ revision: 4 }))
		);
		expect(sent).toEqual([
			{ kind: 'save', build: rev(3), files: { 'main.py': 'b' } },
			{ kind: 'save', build: rev(3), files: { 'main.py': 'b' } },
			{ kind: 'restart', build: rev(4) }
		]);
	});

	it('gives up what waited for a re-send that fails too, and retries the re-send on the timer', () => {
		for (const waiting of [
			{ type: 'run' },
			{ type: 'restart' },
			{ type: 'switch', language: 'go' }
		] as const) {
			const { step, sent } = play(
				edited(),
				{ type: 'tick' },
				respond(unreachable),
				waiting,
				respond(unreachable)
			);
			expect(sent.map((r) => r.kind)).toEqual(['save', 'save']);
			expect(step.state).toMatchObject({
				save: 'failed',
				queued: undefined,
				outcome: undefined,
				restarting: false
			});
			expect(step.timer).toEqual({ afterMs: RETRY_DELAY_MS });
		}
	});

	it('a Language switch after a lost save re-sends it first', () => {
		const { sent } = play(
			edited(),
			{ type: 'tick' },
			respond(unreachable),
			{ type: 'switch', language: 'go' },
			respond(ok({ revision: 4 }))
		);
		expect(sent.map((r) => r.kind)).toEqual(['save', 'save', 'switch']);
	});
});
