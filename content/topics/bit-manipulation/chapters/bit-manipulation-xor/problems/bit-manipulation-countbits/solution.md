`i & (i - 1)` is `i` with its lowest set bit cleared, which is smaller than `i` and has exactly one bit fewer. So `bits[i] = bits[i & (i - 1)] + 1`, with `bits[0] = 0`, and the entry it reads is always already filled in because it is a smaller index.

The table has `N + 1` entries and each takes one read, one AND and one add, so time is O(N) in the worst case and space is O(N). Counting the bits of each number on its own is also O(1) per number for a fixed word size, so the recurrence is not a better bound, only a way to build each answer from one already known.

**Edges.** `N` = 0 prints just `0`. A power of two clears down to 0, so its count is 1. The numbers just below a power of two have all their low bits on, such as 31 and 255.
