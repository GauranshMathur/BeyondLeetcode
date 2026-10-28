The least common multiple of `a` and `b` is `a / gcd(a, b) * b`, as the kernel's `lcm` has it, when neither is 0, and the kernel returns 0 when either is 0.

The order matters. `a * b` can be up to 9 x 10^18 here, and it is only the answer after the division by the gcd. `a / gcd(a, b)` is a whole number, so dividing first keeps every number in the calculation at most as large as the answer, a habit that matters when the numbers are near the limit of the type.

Cost: O(log a + log b) in the worst case, from the `gcd`. Extra space is O(1).
