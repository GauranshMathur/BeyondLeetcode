# Linux: a gcd made of shifts, and a sieve that grows

Two small files in the Linux kernel's `lib/math` folder answer two number-theory questions, and each is a decision about what to keep and what to recompute. The greatest common divisor, `gcd.c`, avoids division. The prime numbers, `prime_numbers.c`, keep a table of primes and rebuild it larger when a caller outgrows it. This Chapter reads both in Linux 6.6. In the Problems you port the first, then rebuild the second.

## A gcd with no division

The comment at the top of `gcd.c` names the method: "This implements the binary GCD algorithm. (Often attributed to Stein, but as Knuth has noted, appears in a first-century Chinese math text.)" ([lib/math/gcd.c, lines 7 to 8](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/gcd.c#L7-L8)) It also gives the reason: "This is faster than the division-based algorithm even on x86, which has decent hardware division." ([lines 10 to 11](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/gcd.c#L10-L11)) That is the kernel authors' claim about their own code. The code is:

```c
unsigned long gcd(unsigned long a, unsigned long b)
{
	unsigned long r = a | b;

	if (!a || !b)
		return r;

	b >>= __ffs(b);
	if (b == 1)
		return r & -r;

	for (;;) {
		a >>= __ffs(a);
		if (a == 1)
			return r & -r;
		if (a == b)
			return a << __ffs(r);

		if (a < b)
			swap(a, b);
		a -= b;
	}
}
```

([lines 23 to 45](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/gcd.c#L23-L45))

`__ffs` finds the lowest set bit of a word: the generic version is documented "__ffs - find first bit in word." and "Undefined if no bit exists, so code should check against 0 first." ([include/asm-generic/bitops/__ffs.h, lines 8 and 11](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/asm-generic/bitops/__ffs.h#L8-L11)) That is why the first thing `gcd` does is return when `a` or `b` is zero. With `a | b` it returns the nonzero one, or 0 when both are 0. So `a >>= __ffs(a)` strips the factors of two from `a`, and the number of them is the number of low zero bits.

## Reading the loop

Two facts do the work. A common divisor of two numbers also divides their difference, so replacing the larger number by the difference keeps the gcd. And the difference of two odd numbers is even, so after each subtraction the next pass strips at least one bit.

Factors of two are handled once, at the start. `r = a | b` has its lowest set bit at the smaller of the two low-zero counts, so `r & -r` is the largest power of two that divides both (`-r` flips every bit above the lowest set one, and the `&` keeps that bit alone). The loop works on the odd parts, and the `a << __ffs(r)` at the end puts the common power of two back. This is the Chapter's reading of the code, not a claim of the file.

Take `gcd(12, 18)`. Here `r` is 12 | 18 = 30, and `r & -r` is 2. `b` is 18 shifted right by one: 9. In the loop `a` is 12 shifted right by two: 3. Since 3 < 9 the two swap, so `a` is 9 and `b` is 3, and `a -= b` makes it 6. The next pass shifts `a` to 3, which equals `b`, so the function returns 3 << 1 = 6. The gcd of 12 and 18 is 6.

The cost: the larger number is replaced by a difference that is shifted right by at least one bit, so the product of the two numbers at least halves on every pass. For 64-bit values that is at most 128 passes, each a few word operations: O(log a + log b) in the worst case, with no division anywhere.

## A table of primes that grows

`prime_numbers.c` keeps its primes in a structure with two sizes and a bitmap: `unsigned long last, sz;` and `unsigned long primes[];`. ([lib/math/prime_numbers.c, lines 11 to 15](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L11-L15)) The bitmap has one bit per number, set when that number is prime. `sz` is the number of bits, and `last` is the largest prime in the table. The table starts with the primes below 64 compiled in: `.last = 61` and `.sz = 64`. ([lines 19 to 20](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L19-L20))

The comment where the table is built says how: "Where memory permits, track the primes using the Sieve of Eratosthenes. The sieve is to remove all multiples of known primes from the set, what remains in the set is therefore prime." ([lines 140 to 143](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L140-L143)) The routine that crosses out the multiples of one prime `x` starts at `2 * x`, or at the first multiple past the part already sieved, and steps by `x`: `m += x;` until the end of the table. ([lines 97 to 104](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L97-L104)) Every number is crossed out once for each prime that divides it, so a table of `sz` bits costs O(sz log log sz) steps to build, in the worst case and every case.

## How big a table

When a caller asks for the next prime above `x` and `x` is already at or past the table's last prime, the table is rebuilt. The loop is `while (x >= p->last)`. ([next_prime_number, lines 194 to 202](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L194-L202)) The new size comes from a theorem, quoted in the code: "Equivalently, if n > 1, then there is always at least one prime p such that n < p < 2n." ([lines 117 to 118](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L117-L118)) The code that follows takes `sz = 2 * x;` and rounds it up to a whole number of machine words, `sz = round_up(sz, BITS_PER_LONG);`. ([lines 123 to 127](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L123-L127)) With 64-bit words, that is a multiple of 64. A table of twice `x` is sure to contain a prime above `x`, so the lookup that follows, `x = find_next_bit(p->primes, p->last, x + 1);`, always finds a prime. ([line 203](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L203))

The kernel does not start from scratch: it copies the old table into the new one, `bitmap_copy(new->primes, p->primes, p->sz);`, and crosses out multiples only from the old size onward. ([lines 144 to 147](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L144-L147)) The Build may rebuild from scratch, since the answers are the same.

Look at the first rebuild. With `x` = 61 the new size is 2 × 61 = 122, rounded up to 128 bits, and the largest prime below 128 is 127. So the table goes from (64, 61) to (128, 127). The same theorem shows that a table never shrinks: a prime always sits between half the size and the size, so `last` is above `sz / 2`, and the next rebuild, which needs `x` at least `last`, asks for more than `sz` bits.

## When the table cannot be built

The sieve needs memory, and the kernel's allocation can fail: `if (!new) return false;`. ([lines 128 to 131](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L128-L131)) Then the code gives up on the table and tests numbers one by one: `if (!expand_to_next_prime(x)) return slow_next_prime_number(x);`. ([lines 197 to 198](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L197-L198)) The slow test divides by every number from the square root of `x` down: `unsigned long y = int_sqrt(x);` then `if ((x % y) == 0)`, with `y--` until `y` is 1. ([lines 71 to 77](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L71-L77)) That is O(√x) divisions per number in the worst case, a long way from a table lookup.

## What the Build does

Problem 7 ports the kernel's `gcd` to all three Languages, for numbers up to 10^18. Problem 8 builds the table: `nextprime X` rebuilds it as the loop above does, and `sieve` prints `sz` and `last`, so your table can be checked against the numbers in this Chapter. The Extra Problem adds `lcm`, the kernel's next function, whose code is one `if` and a division. ([lib/math/lcm.c, lines 8 to 13](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/lcm.c#L8-L13))
