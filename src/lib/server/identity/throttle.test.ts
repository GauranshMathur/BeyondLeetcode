import { describe, expect, it } from 'vitest';
import { createThrottle, throttleKey } from './throttle.ts';

const MIN = 60_000;

const setup = (options: Parameters<typeof createThrottle>[0] = {}) => {
	let t = 1_000_000;
	const throttle = createThrottle({ now: () => t, ...options });
	return { throttle, advance: (ms: number) => (t += ms) };
};

describe('throttleKey', () => {
	it('lower-cases and trims the email', () => {
		expect(throttleKey('  Ada@Example.COM ', '1.1.1.1')).toEqual(
			throttleKey('ada@example.com', '1.1.1.1')
		);
	});
});

describe('throttle', () => {
	it('refuses the sixth attempt after five failures, without counting checks', () => {
		const { throttle } = setup();
		const key = throttleKey('a@x.io', '1.1.1.1');
		for (let i = 0; i < 5; i++) {
			expect(throttle.check(key)).toEqual({ allowed: true });
			throttle.fail(key);
		}
		expect(throttle.check(key)).toEqual({ allowed: false, retryAfterMs: 10 * MIN });
		throttle.check(key);
		expect(throttle.check(key).allowed).toBe(false);
	});

	it('does not block a different address or email', () => {
		const { throttle } = setup();
		const key = throttleKey('a@x.io', '1.1.1.1');
		for (let i = 0; i < 5; i++) throttle.fail(key);
		expect(throttle.check(throttleKey('a@x.io', '2.2.2.2'))).toEqual({ allowed: true });
		expect(throttle.check(throttleKey('b@x.io', '1.1.1.1'))).toEqual({ allowed: true });
	});

	it('uses a fixed window: later failures do not extend it, and its end lets the next attempt through', () => {
		const { throttle, advance } = setup();
		const key = throttleKey('a@x.io', '1.1.1.1');
		throttle.fail(key);
		advance(9 * MIN);
		for (let i = 0; i < 4; i++) throttle.fail(key);
		expect(throttle.check(key)).toEqual({ allowed: false, retryAfterMs: MIN });
		advance(MIN);
		expect(throttle.check(key)).toEqual({ allowed: true });
		throttle.fail(key);
		expect(throttle.check(key)).toEqual({ allowed: true });
	});

	it('clears the pair on success', () => {
		const { throttle } = setup();
		const key = throttleKey('a@x.io', '1.1.1.1');
		for (let i = 0; i < 4; i++) throttle.fail(key);
		throttle.succeed(key);
		for (let i = 0; i < 4; i++) throttle.fail(key);
		expect(throttle.check(key)).toEqual({ allowed: true });
	});

	it('blocks one address that walks through many emails at 20 failures', () => {
		const { throttle } = setup();
		for (let i = 0; i < 20; i++) {
			const key = throttleKey(`u${i}@x.io`, '1.1.1.1');
			expect(throttle.check(key)).toEqual({ allowed: true });
			throttle.fail(key);
		}
		const next = throttleKey('fresh@x.io', '1.1.1.1');
		expect(throttle.check(next).allowed).toBe(false);
		expect(throttle.check(throttleKey('fresh@x.io', '2.2.2.2')).allowed).toBe(true);
	});

	it('does not let a success clear the address count', () => {
		const { throttle } = setup();
		for (let i = 0; i < 19; i++) throttle.fail(throttleKey(`u${i}@x.io`, '1.1.1.1'));
		const own = throttleKey('mine@x.io', '1.1.1.1');
		throttle.succeed(own);
		throttle.fail(own);
		expect(throttle.check(throttleKey('z@x.io', '1.1.1.1')).allowed).toBe(false);
	});

	it('keeps memory bounded, dropping expired entries first', () => {
		const { throttle, advance } = setup({ maxKeys: 4 });
		throttle.fail(throttleKey('old@x.io', '9.9.9.9'));
		advance(11 * MIN);
		for (let i = 0; i < 20; i++) throttle.fail(throttleKey(`u${i}@x.io`, `10.0.0.${i}`));
		expect(throttle.size()).toBeLessThanOrEqual(4);
	});

	it('keeps a blocked key through a flood of single failures from other keys', () => {
		const { throttle } = setup({ maxKeys: 50 });
		const blocked = throttleKey('victim@x.io', '1.1.1.1');
		for (let i = 0; i < 5; i++) throttle.fail(blocked);
		for (let i = 0; i < 5_000; i++)
			throttle.fail(throttleKey(`f${i}@x.io`, `10.${i % 250}.0.${i % 7}`));
		expect(throttle.size()).toBeLessThanOrEqual(50);
		expect(throttle.check(blocked).allowed).toBe(false);
	});

	it('only evicts blocked keys when the whole map is blocked keys', () => {
		const { throttle } = setup({ maxKeys: 4 });
		const first = throttleKey('a@x.io', '1.1.1.1');
		for (let i = 0; i < 5; i++) throttle.fail(first);
		// 2 entries now (pair + address); fill the rest with blocked pairs from other addresses
		for (const n of [2, 3, 4]) {
			const key = throttleKey(`${n}@x.io`, `${n}.${n}.${n}.${n}`);
			for (let i = 0; i < 5; i++) throttle.fail(key);
		}
		expect(throttle.size()).toBeLessThanOrEqual(4);
	});
});
