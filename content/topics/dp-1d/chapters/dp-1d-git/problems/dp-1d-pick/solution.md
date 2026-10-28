Keep two numbers, `before` for the best total up to two items back and `best` for the best total up to one item back, both 0 at the start. For each value `v`, the new best is the larger of `best` (leave this item) and `before + v` (pick it, so its neighbour was left). Then `before` takes the old `best` and `best` takes the new one. Print `best`.

**Why it is right.** The best picks among the first `i` items either leave item `i`, and are then the best picks among the first `i - 1`, or take item `i`, and then item `i - 1` is left, so the rest is the best picks among the first `i - 2`. Starting both numbers at 0 allows picking nothing, so a negative value is never forced.

**Cost.** One pass, so O(n) time in the **worst case**, and O(1) extra space: two numbers instead of a table of `n + 1`. The price, as in the Chapter, is that this gives only the total, not which items were picked.
