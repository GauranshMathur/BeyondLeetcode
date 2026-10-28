# Linux: raising to a power in a loop of squares

Computing `base` to the power `exp` the way you would on paper takes `exp - 1` multiplications. For an exponent of a million that is nearly a million of them. The Linux kernel's integer power function does it in at most forty, and the whole function is thirteen lines. This Chapter reads it in Linux 6.6, then adds a modulus, as Python's `pow` does.

## The function

The file is `lib/math/int_pow.c`. Its header says "An integer based power function" and "Derived from drivers/video/backlight/pwm_bl.c". ([lib/math/int_pow.c, lines 3 to 5](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/int_pow.c#L3-L5)) The comment on the function says what it computes: "Computes: pow(base, exp), i.e. @base raised to the @exp power". ([line 17](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/int_pow.c#L17)) The code is:

```c
u64 int_pow(u64 base, unsigned int exp)
{
	u64 result = 1;

	while (exp) {
		if (exp & 1)
			result *= base;
		exp >>= 1;
		base *= base;
	}

	return result;
}
```

([lines 19 to 31](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/int_pow.c#L19-L31))

There is no loop that counts up to `exp`. The loop reads the exponent one bit at a time, from the lowest bit up.

## Reading the loop

Each pass looks at the lowest bit of `exp`. If it is 1 (`exp & 1`), the current `base` goes into `result`. Then `exp >>= 1` drops that bit, and `base *= base` squares the base for the next one.

Take `int_pow(3, 5)`. Five is 101 in binary.

| Pass | Lowest bit of `exp` | `result` after the pass | `exp` after | `base` after |
|---|---|---|---|---|
| 1 | 1 | 3 | 2 | 9 |
| 2 | 0 | 3 | 1 | 81 |
| 3 | 1 | 243 | 0 | 6561 |

The result is 243, which is 3^5. The reason is that on pass k the base equals the original base to the power 2^k, and `result` collects exactly the ones whose bit is set: 3^5 is 3^1 × 3^4, and the exponent 5 is 1 + 4.

The cost follows from the loop. It runs once per bit of `exp`, which is floor(log2 exp) + 1 passes, and each pass multiplies at most twice. So it makes O(log exp) multiplications in the worst case, against `exp - 1` for the loop that counts. An exponent of one million has 20 bits, so at most 40 multiplications. Look at pass 3 of the table: the last `base *= base` computes 6561, which nothing reads. The loop does that on every call, and the Extra Problem in this Chapter asks you to count it.

## When the answer does not fit

`int_pow` never checks for overflow: `result *= base` and `base *= base` run on `u64` values whatever they hold. What a `u64` multiplication gives when the true product is too big is a rule of the C language and of the kernel's build, not something this file states, so the Build fixes its own rule in Problem 3. The answer is the true power reduced modulo 2^64, which is what Go's specification gives for its own `uint64`: for unsigned values `+`, `-`, `*` and `<<` are computed modulo 2^n, "where n is the bit width of the unsigned integer's type". ([Go 1.22.0 specification, Integer overflow, lines 4999 to 5002](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/doc/go_spec.html#L4999-L5002))

That rule is a modulus, and a modulus can be any number. Reducing after every multiplication is allowed, because the remainder of a product depends only on the remainders of its factors: (a × b) mod m is ((a mod m) × (b mod m)) mod m. So the loop works unchanged if each `*=` is followed by `% m`, and no number ever grows past m². Python builds this into the language. Its documentation for `pow` says: "Return base to the power exp; if mod is present, return base to the power exp, modulo mod (computed more efficiently than pow(base, exp) % mod)." ([Built-in Functions, pow, Python 3.13](https://docs.python.org/3.13/library/functions.html#pow)) The efficiency is the point: the one-expression form builds the full power first, and for a big exponent that number is enormous: 3 to the power 10^18 has more than 10^17 digits.

## The same idea, from the top bit down

CPython does the loop the other way round. Its comment says "Left-to-right binary exponentiation (HAC Algorithm 14.79)". ([Objects/longobject.c, line 5051](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L5051)) The loop starts at the highest set bit of the exponent and walks down:

```c
MULT(z, z, z);
if (bi & bit) {
    MULT(z, a, z);
}
```

([lines 5069 to 5072](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L5069-L5072))

`z` is the running result and `a` the base. Every step squares `z`, and a set bit multiplies by `a`. `MULT` is a macro with its own comment: "Multiply two values, then reduce the result: result = X*Y % c.  If c is NULL, skip the mod." ([lines 5017 to 5018](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L5017-L5018)) So with a modulus, `c`, every multiplication is reduced at once, as in the paragraph above. Because `z` starts as the base itself (`Py_SETREF(z, (PyLongObject*)Py_NewRef(a));`, [line 5058](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L5058)), which stands for the top bit, the loop has no wasted last square. From exponent 2 up, this order makes one fewer square than the kernel's loop and one fewer multiply.

For a very long exponent CPython changes method and takes the exponent in windows: it uses the binary method unless the exponent is big, "(no more than) EXP_WINDOW_SIZE bits at a time". ([line 78](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L78)) The cutoff is `#define HUGE_EXP_CUTOFF 60`, bits of exponent. ([line 103](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L103)) The exponents in your Build stay below 2^60, on the binary side of that line.

## What the Build does

Problem 3 ports the kernel's loop to the Build with the modulus 2^64. Problem 4 gives it any modulus up to 2^31 - 1, so that a product of two reduced numbers still fits in 64 bits, and exponents up to 10^18. The Extra Problem counts the multiplications of the kernel's order and of CPython's.
