Write `E` in binary, with `b` bits and `s` of them set. For `E` of 1 or more:

- The kernel's loop makes `b` passes. Each squares the base, and each of the `s` passes with a set bit also multiplies the result, so it makes `b + s` multiplications.
- The left-to-right loop skips the highest bit, which is set, and makes one squaring for each of the other `b - 1` bits, and one more multiplication for each of the other `s - 1` set bits. That is `(b - 1) + (s - 1)`.

For `E` of 0 both are 0. The Reference Code does not use the formulas: it runs the loops with a counter and no multiplications, which is exactly what the rules say. The formulas are how to check the answer by hand: `10` has `b` = 4 and `s` = 2, so 6 and 3 + 1 = 4.

For `E` of 2 or more the left-to-right loop makes exactly two fewer multiplications than the kernel's. The kernel's loop pays for the last squaring, which nothing reads, and for starting the result at 1 and multiplying it by the first base.

Cost: both loops make one pass for each bit of `E`, so O(log E) in the worst case. Extra space is O(1).
