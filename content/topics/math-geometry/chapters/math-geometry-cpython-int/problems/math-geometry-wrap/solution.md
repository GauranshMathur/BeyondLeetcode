The result must be the number in [-2^31, 2^31 - 1] that differs from the true result by a multiple of 2^32. That is

```
wrap(x) = ((x + 2^31) mod 2^32) - 2^31
```

with `mod` giving a number from 0 up to 2^32 - 1. Adding 2^31 moves the range to [0, 2^32 - 1], where the remainder is the answer, and subtracting 2^31 moves it back. For `2147483647 + 1`: the true sum is 2^31, plus 2^31 is 2^32, the remainder is 0, and 0 - 2^31 is -2,147,483,648.

The Reference Code in Python computes the exact result with Python's integers and then applies `wrap`. In TypeScript and Go it uses the Language's own 32-bit arithmetic, which wraps the same way: Go's `int32` does by its specification, as the Chapter quotes.

Cost: both commands are O(1) in the worst case, since the numbers have a fixed width.
