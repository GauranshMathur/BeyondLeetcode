import { describe, expect, it } from 'vitest';
import { createThrottle, type ThrottleCheck, type ThrottleToken } from './throttle.ts';

const MIN = 60_000;

const setup = (options: Parameters<typeof createThrottle>[0] = {}) => {
	let t = 1_000_000;
	const throttle = createThrottle({ now: () => t, ...options });
	return { throttle, advance: (ms: number) => (t += ms) };
};

const from = (address: string, accountId: string | null = 'acct') => ({ address, accountId });

/** The token of an attempt that was admitted; a refused one has none. */
const tokenOf = (check: ThrottleCheck): ThrottleToken => {
	if (!check.allowed) throw new Error('the attempt was refused');
	return check.token;
};

describe('address spellings', () => {
	const share = (spellings: string[]) => {
		const { throttle } = setup({ addressLimit: 3 });
		const results = spellings.map((a) => throttle.attempt(from(a, null)).allowed);
		return results;
	};

	it('shares one counter across every spelling of an IPv6 /64', () => {
		const spellings = [
			'2001:db8::1',
			'2001:0db8:0:0::1',
			'2001:DB8:0:0:0:0:0:ffff',
			'2001:db8::1%eth0',
			'2001:db8:0:0:1:2:3:4',
			'2001:db8::192.0.2.1'
		];
		expect(share(spellings)).toEqual([true, true, true, false, false, false]);
	});

	it('keeps different /64s apart', () => {
		expect(
			share(['2001:db8:0:1::1', '2001:db8:0:2::1', '2001:db8:0:3::1', '2001:db8:0:4::1'])
		).toEqual([true, true, true, true]);
	});

	it('maps IPv4-mapped IPv6 to the IPv4 counter in every spelling', () => {
		expect(
			share([
				'1.2.3.4',
				'::ffff:1.2.3.4',
				'::ffff:102:304',
				'::FFFF:0102:0304',
				'0:0:0:0:0:ffff:1.2.3.4'
			])
		).toEqual([true, true, true, false, false]);
	});

	it('puts everything that does not parse into one shared bucket', () => {
		expect(
			share(['', 'not an ip', '999.1.1.1', '1.2.3.4%garbage', '2001:db8::1%', '%eth0', '1.2.3'])
		).toEqual([true, true, true, false, false, false, false]);
	});
});

describe('throttle', () => {
	it('admits exactly the limit for a burst made before any result is known', () => {
		const { throttle } = setup();
		const results = Array.from({ length: 20 }, () => throttle.attempt(from('1.1.1.1')));
		expect(results.filter((r) => r.allowed)).toHaveLength(5);
		expect(results.at(-1)).toEqual({ allowed: false, retryAfterMs: 10 * MIN });
	});

	it('refuses the 21st attempt from one address whatever the account, and nulls count too', () => {
		const { throttle } = setup();
		for (let i = 0; i < 20; i++) {
			const accountId = i % 2 ? null : `a${i}`;
			expect(throttle.attempt(from('1.1.1.1', accountId)).allowed).toBe(true);
		}
		expect(throttle.attempt(from('1.1.1.1', 'fresh')).allowed).toBe(false);
		expect(throttle.attempt(from('1.1.1.1', null)).allowed).toBe(false);
		expect(throttle.attempt(from('2.2.2.2', 'fresh')).allowed).toBe(true);
	});

	it('refuses the 6th for one account from one address while another address gets through', () => {
		const { throttle } = setup();
		for (let i = 0; i < 5; i++) throttle.attempt(from('1.1.1.1'));
		expect(throttle.attempt(from('1.1.1.1')).allowed).toBe(false);
		expect(throttle.attempt(from('2.2.2.2')).allowed).toBe(true);
		expect(throttle.attempt(from('1.1.1.1', 'other')).allowed).toBe(true);
	});

	it('limits one account across many addresses at 50', () => {
		const { throttle } = setup();
		for (let i = 0; i < 50; i++) {
			expect(throttle.attempt(from(`10.0.${i}.1`)).allowed).toBe(true);
		}
		expect(throttle.attempt(from('10.9.9.9')).allowed).toBe(false);
		expect(throttle.attempt(from('10.9.9.9', 'other')).allowed).toBe(true);
	});

	it('does not count a refused attempt', () => {
		const { throttle, advance } = setup();
		for (let i = 0; i < 5; i++) throttle.attempt(from('1.1.1.1'));
		for (let i = 0; i < 100; i++) throttle.attempt(from('1.1.1.1'));
		advance(10 * MIN);
		for (let i = 0; i < 5; i++) expect(throttle.attempt(from('1.1.1.1')).allowed).toBe(true);
	});

	it('uses a fixed window: the end lets the next attempt through', () => {
		const { throttle, advance } = setup();
		throttle.attempt(from('1.1.1.1'));
		advance(9 * MIN);
		for (let i = 0; i < 4; i++) throttle.attempt(from('1.1.1.1'));
		expect(throttle.attempt(from('1.1.1.1'))).toEqual({ allowed: false, retryAfterMs: MIN });
		advance(MIN);
		expect(throttle.attempt(from('1.1.1.1'))).toMatchObject({ allowed: true });
	});

	it('succeed clears only the account + address counter', () => {
		const { throttle } = setup();
		for (let i = 0; i < 3; i++) throttle.attempt(from('1.1.1.1'));
		const last = tokenOf(throttle.attempt(from('1.1.1.1')));
		throttle.succeed(last);
		for (let i = 0; i < 5; i++) expect(throttle.attempt(from('1.1.1.1')).allowed).toBe(true);
		expect(throttle.attempt(from('1.1.1.1')).allowed).toBe(false);
	});

	it('succeed gives back exactly one count to the address, so right passwords never use up its budget', () => {
		const { throttle } = setup({ addressLimit: 6 });
		for (let i = 0; i < 4; i++) throttle.attempt(from('1.1.1.1', 'mine'));
		throttle.succeed(tokenOf(throttle.attempt(from('1.1.1.1', 'mine'))));
		// 5 counted, one taken back: two more fit under 6, the third does not.
		expect(throttle.attempt(from('1.1.1.1', 'mine')).allowed).toBe(true);
		expect(throttle.attempt(from('1.1.1.1', 'mine')).allowed).toBe(true);
		expect(throttle.attempt(from('1.1.1.1', 'mine')).allowed).toBe(false);
	});

	it('succeed gives back exactly one count to the Account, however many addresses it signs in from', () => {
		const { throttle } = setup({ accountLimit: 6 });
		for (let i = 1; i < 5; i++) throttle.attempt(from(`1.1.1.${i}`, 'mine'));
		throttle.succeed(tokenOf(throttle.attempt(from('1.1.1.0', 'mine'))));
		expect(throttle.attempt(from('2.2.2.1', 'mine')).allowed).toBe(true);
		expect(throttle.attempt(from('2.2.2.2', 'mine')).allowed).toBe(true);
		expect(throttle.attempt(from('2.2.2.3', 'mine')).allowed).toBe(false);
	});

	it('a class behind one address can all sign in: a right password is attempt + succeed, net zero', () => {
		const { throttle } = setup();
		for (let student = 0; student < 100; student++) {
			const turn = throttle.attempt(from('203.0.113.7', `student-${student}`));
			expect(turn.allowed).toBe(true);
			throttle.succeed(tokenOf(turn));
		}
		expect(throttle.attempt(from('203.0.113.7', 'student-0')).allowed).toBe(true);
	});

	it('the same Account signing in over and over never runs out either', () => {
		const { throttle } = setup();
		for (let i = 0; i < 200; i++) {
			const turn = throttle.attempt(from('1.1.1.1', 'mine'));
			expect(turn.allowed).toBe(true);
			throttle.succeed(tokenOf(turn));
		}
	});

	it("a right password never clears or lowers another Account's failures at the same address", () => {
		const { throttle } = setup({ addressLimit: 8 });
		// An attacker's guesses at the victim's Account...
		for (let i = 0; i < 5; i++) throttle.attempt(from('1.1.1.1', 'victim'));
		// ...then a sign-in with the attacker's own valid Account, many times over.
		for (let i = 0; i < 20; i++) {
			const turn = throttle.attempt(from('1.1.1.1', 'attacker'));
			if (turn.allowed) throttle.succeed(turn.token);
		}
		// The victim's pair budget is untouched, and so is the address's count of their failures.
		expect(throttle.attempt(from('1.1.1.1', 'victim')).allowed).toBe(false);
		expect(throttle.attempt(from('1.1.1.1', 'other-1')).allowed).toBe(true);
		expect(throttle.attempt(from('1.1.1.1', 'other-2')).allowed).toBe(true);
		expect(throttle.attempt(from('1.1.1.1', 'other-3')).allowed).toBe(true);
		expect(throttle.attempt(from('1.1.1.1', 'other-4')).allowed).toBe(false);
	});

	it('succeed leaves no empty entry behind', () => {
		const { throttle } = setup();
		throttle.succeed(tokenOf(throttle.attempt(from('1.1.1.1', 'mine'))));
		expect(throttle.size()).toBe(0);
	});

	it('succeed takes a count back only once per attempt, however often it is called', () => {
		const { throttle } = setup({ addressLimit: 3 });
		throttle.attempt(from('1.1.1.1', 'a'));
		throttle.attempt(from('1.1.1.1', 'b'));
		const mine = tokenOf(throttle.attempt(from('1.1.1.1', 'c')));
		for (let i = 0; i < 5; i++) throttle.succeed(mine);
		// Three attempts, one given back: one more fits, the next does not.
		expect(throttle.attempt(from('1.1.1.1', 'd')).allowed).toBe(true);
		expect(throttle.attempt(from('1.1.1.1', 'e')).allowed).toBe(false);
	});

	describe('when the window ended between the attempt and its success', () => {
		// The counted attempt belonged to a window that is gone; what the counters hold now is other
		// attempts' failures, and a right password must not give them a free guess back.
		it('leaves the new window of the address as it is', () => {
			const { throttle, advance } = setup({ addressLimit: 3 });
			const slow = tokenOf(throttle.attempt(from('1.1.1.1', 'mine')));
			advance(10 * MIN);
			throttle.attempt(from('1.1.1.1', 'guess-1'));
			throttle.attempt(from('1.1.1.1', 'guess-2'));

			throttle.succeed(slow);

			expect(throttle.attempt(from('1.1.1.1', 'guess-3')).allowed).toBe(true);
			expect(throttle.attempt(from('1.1.1.1', 'guess-4')).allowed).toBe(false);
		});

		it('leaves the new window of the Account as it is', () => {
			const { throttle, advance } = setup({ accountLimit: 3 });
			const slow = tokenOf(throttle.attempt(from('1.1.1.1', 'mine')));
			advance(10 * MIN);
			throttle.attempt(from('2.2.2.2', 'mine'));
			throttle.attempt(from('3.3.3.3', 'mine'));

			throttle.succeed(slow);

			expect(throttle.attempt(from('4.4.4.4', 'mine')).allowed).toBe(true);
			expect(throttle.attempt(from('5.5.5.5', 'mine')).allowed).toBe(false);
		});

		it('does not clear the Account + address counter of the new window', () => {
			const { throttle, advance } = setup({ limit: 3 });
			const slow = tokenOf(throttle.attempt(from('1.1.1.1', 'mine')));
			advance(10 * MIN);
			throttle.attempt(from('1.1.1.1', 'mine'));
			throttle.attempt(from('1.1.1.1', 'mine'));

			throttle.succeed(slow);

			expect(throttle.attempt(from('1.1.1.1', 'mine')).allowed).toBe(true);
			expect(throttle.attempt(from('1.1.1.1', 'mine')).allowed).toBe(false);
		});

		it('still gives the count back while the window is the same, even if it ended just now', () => {
			const { throttle, advance } = setup({ addressLimit: 3 });
			throttle.attempt(from('1.1.1.1', 'a'));
			const mine = tokenOf(throttle.attempt(from('1.1.1.1', 'b')));
			advance(10 * MIN);

			throttle.succeed(mine);
			// Nothing in the new window is touched: it starts empty.
			for (let i = 0; i < 3; i++)
				expect(throttle.attempt(from('1.1.1.1', `n${i}`)).allowed).toBe(true);
			expect(throttle.attempt(from('1.1.1.1', 'n3')).allowed).toBe(false);
		});

		it('cannot take a count from a later attempt that landed in the same millisecond as one it already gave back', () => {
			const { throttle } = setup({ addressLimit: 2 });
			const first = tokenOf(throttle.attempt(from('1.1.1.1', 'a')));
			throttle.succeed(first);
			throttle.attempt(from('1.1.1.1', 'b'));
			throttle.attempt(from('1.1.1.1', 'c'));

			throttle.succeed(first);

			expect(throttle.attempt(from('1.1.1.1', 'd')).allowed).toBe(false);
		});
	});

	it('succeed still gives the address its count back when a full Account map had no room for the Account', () => {
		const { throttle } = setup({ maxKeys: 2, addressLimit: 3 });
		throttle.attempt(from('1.1.1.1', 'a'));
		throttle.attempt(from('1.1.1.2', 'b'));
		// The Account maps are full of live entries: this Account goes uncounted there.
		const mine = tokenOf(throttle.attempt(from('1.1.1.3', 'c')));
		throttle.succeed(mine);
		expect(throttle.attempt(from('1.1.1.4', 'd')).allowed).toBe(true);
	});

	it('succeed with no account does nothing', () => {
		const { throttle } = setup();
		const turn = throttle.attempt(from('1.1.1.1', null));
		throttle.succeed(tokenOf(turn));
		expect(throttle.size()).toBe(1);
	});

	it('never refuses a fresh address after a flood beyond the cap, and stays bounded', () => {
		const maxKeys = 50;
		const { throttle } = setup({ maxKeys });
		for (let i = 0; i < maxKeys * 4; i++) {
			expect(throttle.attempt(from(`10.${i >> 8}.${i & 255}.1`, `acct${i}`)).allowed).toBe(true);
			expect(throttle.size()).toBeLessThanOrEqual(3 * maxKeys);
		}
		expect(throttle.attempt(from('99.99.99.99', 'someone')).allowed).toBe(true);
	});

	it('holds the per-account limit of 50 while the address map is flooded and evicting', () => {
		const { throttle } = setup({ maxKeys: 60 });
		let admitted = 0;
		for (let i = 0; i < 200; i++) {
			if (throttle.attempt(from(`10.${i >> 8}.${i & 255}.1`, 'victim')).allowed) admitted++;
			throttle.attempt(from(`11.${i >> 8}.${i & 255}.1`, null));
		}
		expect(admitted).toBe(50);
		expect(throttle.attempt(from('99.99.99.99', 'victim')).allowed).toBe(false);
	});

	it('never drops a live Account entry when its map is full, and still applies the address limit', () => {
		const { throttle } = setup({ maxKeys: 3, addressLimit: 2 });
		for (let i = 0; i < 3; i++) throttle.attempt(from(`1.1.1.${i}`, `a${i}`));
		expect(throttle.attempt(from('2.2.2.2', 'new')).allowed).toBe(true);
		// the original accounts are still counted
		for (let i = 0; i < 4; i++) throttle.attempt(from(`3.3.3.${i}`, 'a0'));
		expect(throttle.attempt(from('4.4.4.4', 'a0')).allowed).toBe(true);
		expect(throttle.size()).toBeLessThanOrEqual(9);
		throttle.attempt(from('5.5.5.5', 'new2'));
		expect(throttle.attempt(from('5.5.5.5', 'new2')).allowed).toBe(true);
		expect(throttle.attempt(from('5.5.5.5', 'new3')).allowed).toBe(false);
	});

	it('drops expired entries first when full', () => {
		const { throttle, advance } = setup({ maxKeys: 3 });
		for (let i = 0; i < 3; i++) throttle.attempt(from(`1.1.1.${i}`, null));
		advance(5 * MIN);
		throttle.attempt(from('2.2.2.2', null));
		advance(5 * MIN);
		// the first three have ended; only the newer one should remain before this call
		throttle.attempt(from('3.3.3.3', null));
		expect(throttle.size()).toBe(2);
	});

	it('clears everything after the window', () => {
		const { throttle, advance } = setup();
		for (let i = 0; i < 30; i++) throttle.attempt(from(`10.0.0.${i}`, `a${i}`));
		advance(10 * MIN);
		throttle.attempt(from('9.9.9.9', null));
		expect(throttle.size()).toBe(1);
	});
});

describe('emails that have no Account', () => {
	// The caller names them by a digest (`unknownEmail`), kept apart from real Account ids, so that a
	// stranger typing many emails can use up only the room reserved for emails.
	const unknown = (address: string, digest: string) => ({
		address,
		accountId: null,
		unknownEmail: digest
	});

	it('are refused on the 6th try from one address, on the same schedule as a known Account', () => {
		for (const input of [from('1.1.1.1', 'user-id'), unknown('1.1.1.1', 'digest')]) {
			const { throttle } = setup();
			const answers = Array.from({ length: 7 }, () => throttle.attempt(input).allowed);
			expect(answers).toEqual([true, true, true, true, true, false, false]);
		}
	});

	it('are refused on the 51st try across many addresses, on the same schedule as a known Account', () => {
		for (const make of [
			(address: string) => from(address, 'user-id'),
			(address: string) => unknown(address, 'digest')
		]) {
			const { throttle } = setup();
			const answers = Array.from(
				{ length: 52 },
				(_, i) => throttle.attempt(make(`10.0.${i}.1`)).allowed
			);
			expect(answers.filter(Boolean)).toHaveLength(50);
		}
	});

	it('count against the address like any attempt', () => {
		const { throttle } = setup({ addressLimit: 3 });
		for (let i = 0; i < 3; i++) throttle.attempt(unknown('1.1.1.1', `d${i}`));
		expect(throttle.attempt(unknown('1.1.1.1', 'd3')).allowed).toBe(false);
		expect(throttle.attempt(from('1.1.1.1', 'user-id')).allowed).toBe(false);
	});

	it('never share a counter with a real Account id, whatever the two are called', () => {
		const { throttle } = setup();
		for (let i = 0; i < 5; i++) throttle.attempt(unknown('1.1.1.1', 'same'));
		expect(throttle.attempt(unknown('1.1.1.1', 'same')).allowed).toBe(false);
		// A real Account whose id happens to read like the digest has a count of its own.
		expect(throttle.attempt(from('1.1.1.1', 'same')).allowed).toBe(true);
	});

	it('give a count back on succeed, in the window they were counted in, like a known Account', () => {
		const { throttle, advance } = setup({ addressLimit: 3 });
		throttle.attempt(unknown('1.1.1.1', 'a'));
		throttle.succeed(tokenOf(throttle.attempt(unknown('1.1.1.1', 'a'))));
		expect(throttle.attempt(unknown('1.1.1.1', 'b')).allowed).toBe(true);
		expect(throttle.attempt(unknown('1.1.1.1', 'c')).allowed).toBe(true);
		expect(throttle.attempt(unknown('1.1.1.1', 'd')).allowed).toBe(false);

		advance(10 * MIN);
		const slow = tokenOf(throttle.attempt(unknown('2.2.2.2', 'x')));
		advance(10 * MIN);
		throttle.attempt(unknown('2.2.2.2', 'x'));
		throttle.attempt(unknown('2.2.2.2', 'x'));
		throttle.succeed(slow);
		// Two failures in the new window, nothing given back: one more fits under 3.
		expect(throttle.attempt(unknown('2.2.2.2', 'x')).allowed).toBe(true);
		expect(throttle.attempt(unknown('2.2.2.2', 'x')).allowed).toBe(false);
	});

	describe('typed in a flood', () => {
		const maxKeys = 20;
		// One address with no limit of its own, so only the email maps are under test.
		const flood = (throttle: ReturnType<typeof createThrottle>, count: number, start = 0) => {
			for (let i = start; i < start + count; i++) throttle.attempt(unknown('9.9.9.9', `fake-${i}`));
		};

		it('evict the oldest emails and never grow past maxKeys, never refusing', () => {
			const { throttle } = setup({ maxKeys, addressLimit: 1_000_000 });
			for (let i = 0; i < 5 * maxKeys; i++) {
				expect(throttle.attempt(unknown('9.9.9.9', `fake-${i}`)).allowed).toBe(true);
			}

			// The address, plus the two email maps at their cap; no real-Account map holds anything.
			expect(throttle.size()).toBe(1 + 2 * maxKeys);
		});

		it('leave a known Account counted: refused on its 6th wrong try from one address', () => {
			const { throttle } = setup({ maxKeys, addressLimit: 1_000_000 });
			// Two tries before the flood, so its counters already exist; the rest come after.
			for (let i = 0; i < 2; i++) throttle.attempt(from('1.1.1.1', 'victim'));
			flood(throttle, 10 * maxKeys);

			const rest = Array.from({ length: 4 }, () => throttle.attempt(from('1.1.1.1', 'victim')));

			expect(rest.map((r) => r.allowed)).toEqual([true, true, true, false]);
		});

		it('leave a known Account the flood never saw counted too: refused on its 6th try', () => {
			const { throttle } = setup({ maxKeys, addressLimit: 1_000_000 });
			flood(throttle, 10 * maxKeys);

			const tries = Array.from({ length: 7 }, () => throttle.attempt(from('1.1.1.1', 'victim')));

			expect(tries.map((r) => r.allowed)).toEqual([true, true, true, true, true, false, false]);
		});

		it('leave a known Account held to 50 across addresses: refused on its 51st try', () => {
			const { throttle } = setup({ maxKeys, addressLimit: 1_000_000 });
			for (let i = 0; i < 25; i++) throttle.attempt(from(`10.0.0.${i}`, 'victim'));
			flood(throttle, 10 * maxKeys);
			let admitted = 25;
			for (let i = 25; i < 60; i++) {
				if (throttle.attempt(from(`10.0.0.${i}`, 'victim')).allowed) admitted++;
				flood(throttle, 3, 1000 + i * 3);
			}

			expect(admitted).toBe(50);
		});

		it('can evict an unknown email, which then starts a fresh count: the cost is more than maxKeys attempts per check', () => {
			const { throttle } = setup({ maxKeys, addressLimit: 1_000_000 });
			for (let i = 0; i < 5; i++) throttle.attempt(unknown('1.1.1.1', 'target'));
			expect(throttle.attempt(unknown('1.1.1.1', 'target')).allowed).toBe(false);

			// Fewer than maxKeys others does not move it ...
			flood(throttle, maxKeys - 2);
			expect(throttle.attempt(unknown('1.1.1.1', 'target')).allowed).toBe(false);
			// ... more than maxKeys does.
			flood(throttle, maxKeys + 1, 100);
			expect(throttle.attempt(unknown('1.1.1.1', 'target')).allowed).toBe(true);
		});
	});
});
