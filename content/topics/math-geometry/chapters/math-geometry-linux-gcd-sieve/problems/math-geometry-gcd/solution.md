The code follows the kernel's `gcd`, which the Chapter walks through.

```
r = a | b
if a == 0 or b == 0: return r
b = b >> (low zero bits of b)
if b == 1: return r & -r
loop:
    a = a >> (low zero bits of a)
    if a == 1: return r & -r
    if a == b: return a << (low zero bits of r)
    if a < b: swap a and b
    a = a - b
```

The facts it uses: a common divisor of two numbers divides their difference, so replacing the larger by the difference keeps the gcd; the difference of two odd numbers is even, so the next pass removes at least one bit; and `r & -r`, the lowest set bit of `a | b`, is the largest power of two that divides both numbers, which the loop's odd parts no longer carry.

Take `gcd(12, 18)`. `r` is 30 and `r & -r` is 2. `b` becomes 9. In the loop `a` becomes 3, which is less than 9, so they swap and `a` is 9, `b` is 3, and `a` becomes 6. Next `a` becomes 3, equal to `b`, so it returns 3 shifted left by one: 6.

Cost: each pass replaces the larger number by a difference that is then shifted right by at least one bit, so the product of the two numbers at least halves on every pass. That gives O(log a + log b) passes in the worst case, at most about 128 for numbers below 2^64, each a few word operations. Extra space is O(1). Euclid's remainder loop is also fast enough here, but this Problem follows the kernel.
