import { describe, expect, it } from 'vitest';
import { sandboxConfig } from './config';
import { checkHardStop, checkRemove, parseTeardownTimes } from './teardown-times.testutil';

const T0 = 1_700_000_000_000;
const nano = (ms: number) => (BigInt(ms) * 1_000_000n).toString();
const ev = (action: string, id: string, ms: number) => `${action} ${id} ${nano(ms)}`;
const log = (...events: string[]) => `${events.join('\n')}\n`;

/** One container created at `at`, started 150 ms later, with the given later events. */
const container = (id: string, at: number, ...rest: [string, number][]) => [
	ev('create', id, at),
	ev('start', id, at + 150),
	...rest.map(([action, ms]) => ev(action, id, at + ms))
];

const times = (out: string) => {
	const t = parseTeardownTimes(out, T0 - 1);
	if (!t) throw new Error('no bomb container found');
	return t;
};

describe('parseTeardownTimes', () => {
	it('reads start, first kill, die and destroy in ms after the create', () => {
		const t = times(
			log(
				...container(
					'a',
					T0,
					['kill', 10_000],
					['kill', 10_300],
					['die', 12_150],
					['destroy', 12_156]
				)
			)
		);
		expect(t).toEqual({ startMs: 150, killMs: 10_000, dieMs: 12_150, destroyMs: 12_156 });
	});

	it('leaves the kill out for a container that ended by itself', () => {
		const t = times(log(...container('a', T0, ['die', 900], ['destroy', 903])));
		expect(t.killMs).toBeUndefined();
		expect(t.dieMs).toBe(900);
	});

	it('leaves the destroy out when none came', () => {
		expect(times(log(...container('a', T0, ['die', 900]))).destroyMs).toBeUndefined();
	});

	it('takes none of an earlier test, a create with no start, or another container kill', () => {
		const out = log(
			...container('old', T0 - 5_000, ['die', 900], ['destroy', 903]),
			ev('create', 'noStart', T0 + 100),
			...container('bomb', T0 + 50, ['die', 900], ['destroy', 905]),
			ev('create', 'noStart2', T0 + 200),
			ev('kill', 'other', T0 + 300)
		);
		const t = parseTeardownTimes(out, T0);
		expect(t).toEqual({ startMs: 150, killMs: undefined, dieMs: 900, destroyMs: 905 });
	});

	it('takes nothing from an earlier test when it is the only container that started', () => {
		const out = log(
			...container('old', T0 - 5_000, ['die', 900], ['destroy', 903]),
			ev('create', 'bomb', T0 + 50)
		);
		expect(parseTeardownTimes(out, T0)).toBeUndefined();
	});

	it('takes the last started create after the start', () => {
		const out = log(
			...container('first', T0 + 10, ['die', 900], ['destroy', 903]),
			...container('second', T0 + 2_000, ['die', 700], ['destroy', 702])
		);
		expect(parseTeardownTimes(out, T0)).toEqual({
			startMs: 150,
			killMs: undefined,
			dieMs: 700,
			destroyMs: 702
		});
	});

	it('is undefined without a started container or without a die', () => {
		expect(parseTeardownTimes(log(ev('create', 'a', T0)), T0)).toBeUndefined();
		expect(parseTeardownTimes(log(...container('a', T0)), T0)).toBeUndefined();
		expect(parseTeardownTimes('', T0)).toBeUndefined();
	});
});

describe('the hard-stop check', () => {
	const hardStop = (...rest: [string, number][]) =>
		checkHardStop(times(log(...container('a', T0, ...rest))));

	it('passes the run of 2026-11-14, whose kill came on time and whose death was slow', () => {
		expect(hardStop(['kill', 10_000], ['die', 22_012], ['destroy', 22_018])).toBe('pass');
	});

	it('passes the run of 2026-11-15', () => {
		expect(hardStop(['kill', 10_000], ['die', 24_874], ['destroy', 24_878])).toBe('pass');
	});

	it('fails a hard stop that never fired', () => {
		const verdict = hardStop(['die', 20_000], ['destroy', 20_004]);
		expect(verdict).not.toBe('pass');
		expect(verdict).toContain('no kill');
		expect(verdict).toContain('19850');
	});

	it('fails a late kill', () => {
		const verdict = hardStop(['kill', 12_500], ['die', 13_000], ['destroy', 13_003]);
		expect(verdict).not.toBe('pass');
		expect(verdict).toContain('12350');
	});

	it('passes a container that ended by itself', () => {
		expect(hardStop(['die', 900], ['destroy', 903])).toBe('pass');
	});

	it('allows the bound as the configured stop plus one second', () => {
		const edge = sandboxConfig.containerTimeoutMs + 1_000;
		expect(hardStop(['kill', edge + 149], ['die', edge + 200])).toBe('pass');
		expect(hardStop(['kill', edge + 150], ['die', edge + 200])).not.toBe('pass');
	});
});

describe('the remove check', () => {
	it('passes the run of 2026-11-15', () => {
		const t = times(
			log(...container('a', T0, ['kill', 10_000], ['die', 24_874], ['destroy', 24_878]))
		);
		expect(checkRemove(t)).toBe('pass');
	});

	const remove = (...rest: [string, number][]) =>
		checkRemove(times(log(...container('a', T0, ...rest))));

	it('passes a destroy that follows the die at once', () => {
		expect(remove(['kill', 10_000], ['die', 22_012], ['destroy', 22_018])).toBe('pass');
		expect(remove(['die', 900], ['destroy', 903])).toBe('pass');
	});

	it('fails a destroy 600 ms after the die', () => {
		const verdict = remove(['die', 900], ['destroy', 1_500]);
		expect(verdict).not.toBe('pass');
		expect(verdict).toContain('600');
	});

	it('fails a missing destroy', () => {
		const verdict = remove(['die', 900]);
		expect(verdict).not.toBe('pass');
		expect(verdict).toContain('no destroy');
	});
});
