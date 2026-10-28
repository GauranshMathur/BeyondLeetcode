Keep `table[m]`, the fewest coins that add up to exactly `m`, with `table[0] = 0` and every other entry "impossible". For `m` from 1 to `A`, look at each coin value `c` at most `m`. If `table[m - c]` is possible, then `table[m - c] + 1` is a candidate for `table[m]`, and `table[m]` is the smallest candidate. Print `table[A]`, or `-1` if it is impossible.

**Why it is right.** The best way to make `m` ends with some coin `c`. Taking that coin away leaves a way to make `m - c`, and it must be a best way, since a better one would give a better way to make `m`. So `table[m]` is one plus the smallest `table[m - c]` over the coins that fit. Greedy fails because the largest coin that fits is not always the last coin of a best way, as the example shows.

**Cost.** `A + 1` entries, each looking at every coin: O(A × S) in the **worst case** for `S` coin values, and O(A) space. This is the loop of `ways` with a minimum in place of a sum, so it needs no modulo: the answer is at most `A`.
