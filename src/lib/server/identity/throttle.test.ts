import { describe, expect, it } from 'vitest';
import { createThrottle, throttleKey } from './throttle.ts';

const MIN = 60_000;

const setup = (options: Parameters<typeof createThrottle>[0] = {}) => {
	let t = 1_000_000;
	const throttle = createThrottle({ now: () => t, ...options });
	return { throttle, advance: (ms: number) => (t += ms) };
};

describe('throttleKey', () => {
	it('lower-cases the email like Better Auth and does not touch plus-tags, dots or whitespace', () => {
		expect(throttleKey('Ada@Example.COM', '1.1.1.1')).toEqual(
			throttleKey('ada@example.com', '1.1.1.1')
		);
		expect(throttleKey('a+x@x.io', '1.1.1.1').email).not.toEqual(
			throttleKey('a@x.io', '1.1.1.1').email
		);
		expect(throttleKey('a.b@x.io', '1.1.1.1').email).not.toEqual(
			throttleKey('ab@x.io', '1.1.1.1').email
		);
	});

	it('shares one bucket for empty and over-long emails', () => {
		const long = throttleKey(`${'a'.repeat(5_000)}@x.io`, '1.1.1.1');
		const longer = throttleKey(`${'b'.repeat(9_000)}@x.io`, '1.1.1.1');
		expect(long).toEqual(longer);
		expect(throttleKey('', '1.1.1.1')).toEqual(long);
		expect(long.pair.length).toBeLessThan(100);
	});

	it('gives every spelling of one IPv6 /64 one key', () => {
		const spellings = [
			'2001:db8::1',
			'2001:0db8:0:0::1',
			'2001:DB8:0:0:0:0:0:ffff',
			'2001:db8::1%eth0',
			'2001:db8:0:0:1:2:3:4',
			'2001:db8::192.0.2.1'
		];
		const keys = spellings.map((a) => throttleKey('a@x.io', a));
		for (const k of keys) expect(k).toEqual(keys[0]);
		expect(throttleKey('a@x.io', '2001:db8:0:1::1').address).not.toEqual(keys[0].address);
	});

	it('maps IPv4-mapped IPv6 to the IPv4 key in every spelling', () => {
		const v4 = throttleKey('a@x.io', '1.2.3.4');
		for (const a of [
			'::ffff:1.2.3.4',
			'::ffff:102:304',
			'::FFFF:0102:0304',
			'0:0:0:0:0:ffff:1.2.3.4'
		]) {
			expect(throttleKey('a@x.io', a)).toEqual(v4);
		}
		expect(throttleKey('a@x.io', '1.2.3.5').address).not.toEqual(v4.address);
	});

	it('puts everything that does not parse into one shared bucket', () => {
		const junk = ['', 'not an ip', '999.1.1.1', '1.2.3', '2001:db8::zz', '1.2.3.4, 5.6.7.8'].map(
			(a) => throttleKey('a@x.io', a)
		);
		for (const k of junk) expect(k).toEqual(junk[0]);
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

	it('never evicts an unexpired key: a blocked key survives a flood and the flood is refused', () => {
		const maxKeys = 50;
		const { throttle } = setup({ maxKeys });
		const blocked = throttleKey('victim@x.io', '1.1.1.1');
		for (let i = 0; i < 5; i++) throttle.attempt(blocked);
		const flood = Array.from({ length: maxKeys * 2 }, (_, i) =>
			throttle.attempt(throttleKey(`f${i}@x.io`, `10.${i % 250}.0.${i % 7}`))
		);
		expect(flood.filter((r) => r.allowed).length).toBeLessThanOrEqual(maxKeys);
		expect(flood.at(-1)).toMatchObject({ allowed: false });
		expect(throttle.size()).toBeLessThanOrEqual(3 * maxKeys);
		expect(throttle.attempt(blocked).allowed).toBe(false);
	});

	it('keeps counting existing keys when the maps are full, and refuses new ones with the soonest expiry', () => {
		const { throttle, advance } = setup({ maxKeys: 3 });
		const known = throttleKey('known@x.io', '1.1.1.1');
		throttle.attempt(known);
		advance(MIN);
		throttle.attempt(throttleKey('b@x.io', '2.2.2.2'));
		throttle.attempt(throttleKey('c@x.io', '3.3.3.3'));
		expect(throttle.attempt(known).allowed).toBe(true);
		expect(throttle.attempt(throttleKey('d@x.io', '4.4.4.4'))).toEqual({
			allowed: false,
			retryAfterMs: 9 * MIN
		});
	});

	it('clears everything after the window', () => {
		const { throttle, advance } = setup({ maxKeys: 5 });
		for (let i = 0; i < 20; i++) throttle.attempt(throttleKey(`f${i}@x.io`, `10.0.0.${i}`));
		advance(10 * MIN);
		expect(throttle.attempt(throttleKey('new@x.io', '9.9.9.9')).allowed).toBe(true);
		expect(throttle.size()).toBe(3);
	});

	it('does not let an email flood starve address tracking', () => {
		const { throttle } = setup({ maxKeys: 10 });
		for (let i = 0; i < 100; i++) throttle.attempt(throttleKey(`f${i}@x.io`, '1.1.1.1'));
		// emails and pairs are full, but the one address was tracked and is still below its limit
		expect(throttle.size()).toBeLessThanOrEqual(30);
		expect(throttle.attempt(throttleKey('f0@x.io', '1.1.1.1')).allowed).toBe(true);
	});
});
