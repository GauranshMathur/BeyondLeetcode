`n & (n - 1)` clears the lowest bit that is on: subtracting 1 turns that bit off and the zeros below it on, and the AND removes them. It is 0 exactly when at most one bit was on, so `n != 0 && (n & (n - 1)) == 0` is the power-of-two test, the kernel's `is_power_of_2`. The test for 0 matters because 0 also leaves 0.

`n & -n` keeps only the lowest bit that is on. `-n` is `~n + 1`: the flip turns the lowest 1 into a 0 with 1s below it, and adding 1 carries through those 1s and sets that same bit again. Above it the bits stay flipped, so the AND is 0 there. For `n` = 0 the result is 0.

Each word takes a fixed number of operations, so each command is O(n) in the worst case for n words.

**Language notes.** The words are unsigned. In TypeScript convert the AND with `>>> 0`; `w & -w` works on 32 bits. In Go, unary minus on a `uint32` is allowed and wraps. In Python, a non-negative `w & -w` already gives the lowest bit.

**Edges.** The word 0 prints `0` and `no`. The top bit alone, 2147483648, is a power of two; `4294967295` is not.
