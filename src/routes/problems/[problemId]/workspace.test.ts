import { describe, expect, it } from 'vitest';
import type { BuildRef, RunView, SubmitView } from '$lib/server/learning/core';
import {
	begin,
	type Event,
	RETRY_DELAY_MS,
	type Reply,
	SAVE_DELAY_MS,
	type Session,
	type Step,
	transition
} from './workspace';

const build: BuildRef = { problemId: 'stacks-push', language: 'python', revision: 3 };
const runView = { revision: 5, tests: [] } as RunView;
const submitView = { revision: 5, verdict: 'Accepted' } as unknown as SubmitView;

const ok = (data: unknown): Reply => ({ ok: true, data });
const fail = (status: number, revision?: number): Reply => ({ ok: false, status, revision });
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
		const run = play(edited(), { type: 'tick' }, { type: 'submit' }, respond(fail(500)));
		expect(run.sent.map((r) => r.kind)).toEqual(['save', 'submit']);
		expect(run.sent[1]).toMatchObject({ build, files: { 'main.py': 'b' } });
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

it('ignores an answer when nothing is on the wire', () => {
	const { state, sent } = play(fresh(), respond(ok({ revision: 9 })));
	expect(state).toEqual(fresh());
	expect(sent).toEqual([]);
});
