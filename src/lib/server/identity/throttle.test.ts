import { describe, expect, it } from 'vitest';
import { createThrottle, throttleKey } from './throttle.ts';

const MIN = 60_000;

const setup = (options: Parameters<typeof createThrottle>[0] = {}) => {
	let t = 1_000_000;
	const throttle = createThrottle({ now: () => t, ...options });
	return { throttle, advance: (ms: number) => (t += ms) };
};

describe('throttleKey', () => {
	it('trims and lower-cases the email', () => {
		expect(throttleKey('  Ada@Example.COM ', '1.1.1.1')).toEqual(
			throttleKey('ada@example.com', '1.1.1.1')
		);
	});

	it('bounds the email length', () => {
		const long = throttleKey(`${'a'.repeat(5_000)}@x.io`, '1.1.1.1');
		expect(long.email.length).toBeLessThan(300);
		expect(long.pair.length).toBeLessThan(400);
	});

	it('keys IPv6 on the /64 prefix and leaves IPv4 alone', () => {
		const a = throttleKey('a@x.io', '2001:db8:1:2:aaaa:bbbb:cccc:dddd');
		const b = throttleKey('a@x.io', '2001:0DB8:1:2::1');
		const other = throttleKey('a@x.io', '2001:db8:1:3::1');
		expect(a).toEqual(b);
		expect(a.address).not.toEqual(other.address);
		expect(throttleKey('a@x.io', '::ffff:1.2.3.4').address).toEqual(
			throttleKey('a@x.io', '1.2.3.4').address
		);
		expect(throttleKey('a@x.io', '1.2.3.4').address).toBe('a:1.2.3.4');
	});
});

describe('throttle', () => {
	it('admits exactly the limit and refuses the sixth, refusals not counting', () => {
		const { throttle } = setup();
		const key = throttleKey('a@x.io', '1.1.1.1');
		for (let i = 0; i < 5; i++) expect(throttle.attempt(key)).toEqual({ allowed: true });
		expect(throttle.attempt(key)).toEqual({ allowed: false, retryAfterMs: 10 * MIN });
		expect(throttle.attempt(key).allowed).toBe(false);
	});

	it('admits exactly the limit for a burst made before any result is known', () => {
		const { throttle } = setup();
		const key = throttleKey('a@x.io', '1.1.1.1');
		const results = Array.from({ length: 20 }, () => throttle.attempt(key));
		expect(results.filter((r) => r.allowed)).toHaveLength(5);
	});

	it('does not block a different address and email', () => {
		const { throttle } = setup();
		for (let i = 0; i < 5; i++) throttle.attempt(throttleKey('a@x.io', '1.1.1.1'));
		expect(throttle.attempt(throttleKey('a@x.io', '2.2.2.2')).allowed).toBe(true);
		expect(throttle.attempt(throttleKey('b@x.io', '3.3.3.3')).allowed).toBe(true);
	});

	it('uses a fixed window: the end lets the next attempt through', () => {
		const { throttle, advance } = setup();
		const key = throttleKey('a@x.io', '1.1.1.1');
		throttle.attempt(key);
		advance(9 * MIN);
		for (let i = 0; i < 4; i++) throttle.attempt(key);
		expect(throttle.attempt(key)).toEqual({ allowed: false, retryAfterMs: MIN });
		advance(MIN);
		expect(throttle.attempt(key)).toEqual({ allowed: true });
	});

	it('clears the email-scoped counters on success', () => {
		const { throttle } = setup();
		const key = throttleKey('a@x.io', '1.1.1.1');
		for (let i = 0; i < 4; i++) throttle.attempt(key);
		throttle.succeed(key);
		for (let i = 0; i < 5; i++) expect(throttle.attempt(key).allowed).toBe(true);
		expect(throttle.attempt(key).allowed).toBe(false);
	});

	it('blocks one address walking through many emails at 20 attempts', () => {
		const { throttle } = setup();
		for (let i = 0; i < 20; i++) {
			expect(throttle.attempt(throttleKey(`u${i}@x.io`, '1.1.1.1')).allowed).toBe(true);
		}
		expect(throttle.attempt(throttleKey('fresh@x.io', '1.1.1.1')).allowed).toBe(false);
		expect(throttle.attempt(throttleKey('fresh@x.io', '2.2.2.2')).allowed).toBe(true);
	});

	it('does not let a success clear the address budget', () => {
		const { throttle } = setup();
		const own = throttleKey('mine@x.io', '1.1.1.1');
		for (let i = 0; i < 19; i++) {
			throttle.attempt(throttleKey(`u${i}@x.io`, '1.1.1.1'));
		}
		throttle.attempt(own);
		throttle.succeed(own);
		expect(throttle.attempt(throttleKey('z@x.io', '1.1.1.1')).allowed).toBe(false);
	});

	it('limits one email across many addresses at 50', () => {
		const { throttle } = setup();
		for (let i = 0; i < 50; i++) {
			expect(throttle.attempt(throttleKey('v@x.io', `10.0.${i}.1`)).allowed).toBe(true);
		}
		expect(throttle.attempt(throttleKey('v@x.io', '10.9.9.9')).allowed).toBe(false);
		expect(throttle.attempt(throttleKey('w@x.io', '10.9.9.9')).allowed).toBe(true);
	});

	it('shares one budget across IPv6 privacy addresses', () => {
		const { throttle } = setup();
		for (let i = 0; i < 5; i++) {
			expect(throttle.attempt(throttleKey('v@x.io', `2001:db8:1:2:${i}::${i}`)).allowed).toBe(true);
		}
		expect(throttle.attempt(throttleKey('v@x.io', '2001:db8:1:2:ffff::1')).allowed).toBe(false);
	});

	it('keeps memory bounded, dropping expired entries first', () => {
		const { throttle, advance } = setup({ maxKeys: 6 });
		throttle.attempt(throttleKey('old@x.io', '9.9.9.9'));
		advance(11 * MIN);
		for (let i = 0; i < 20; i++) throttle.attempt(throttleKey(`u${i}@x.io`, `10.0.0.${i}`));
		expect(throttle.size()).toBeLessThanOrEqual(6);
	});

	it('keeps a blocked key through a flood of other keys', () => {
		const { throttle } = setup({ maxKeys: 60 });
		const blocked = throttleKey('victim@x.io', '1.1.1.1');
		for (let i = 0; i < 5; i++) throttle.attempt(blocked);
		for (let i = 0; i < 5_000; i++) {
			throttle.attempt(throttleKey(`f${i}@x.io`, `10.${i % 250}.0.${i % 7}`));
		}
		expect(throttle.size()).toBeLessThanOrEqual(60);
		expect(throttle.attempt(blocked).allowed).toBe(false);
	});

	it('stays bounded even when every stored key is blocked', () => {
		const { throttle } = setup({ maxKeys: 6 });
		for (const n of [1, 2, 3, 4]) {
			const key = throttleKey(`${n}@x.io`, `${n}.${n}.${n}.${n}`);
			for (let i = 0; i < 5; i++) throttle.attempt(key);
		}
		expect(throttle.size()).toBeLessThanOrEqual(6);
	});
});
