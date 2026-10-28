The loop is the kernel's `int_pow`:

```
result = 1
while exp is not 0:
    if exp is odd: result = result * base
    exp = exp / 2   (drop the lowest bit)
    base = base * base
```

with every `*` taken modulo 2^64. On pass `k` the base is the original base to the power 2^k, and the result collects the powers whose bit in the exponent is set, so at the end `result` is the original base to the power `exp`. Taking the remainder after each step is allowed because the remainder of a product depends only on the remainders of its factors.

Cost: the loop has one pass for each bit of `exp`, at most 32 here, and each pass multiplies at most twice. That is O(log E) multiplications in the worst case, against `E - 1` for repeated multiplication. Extra space is O(1).

Go's `uint64` arithmetic wraps by its specification (the Chapter quotes it), so the Go Reference Code needs no remainder at all. Python and TypeScript take it with `% 2^64`, or a mask of 64 one-bits, after each multiplication.
