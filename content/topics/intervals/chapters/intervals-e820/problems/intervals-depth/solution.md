Make two events for each interval `lo hi`: `(lo, +1)` and `(hi + 1, -1)`. Sort the events by number, and at an equal number the `-1` before the `+1`. Walk them with a count that starts at 0, add each step, and remember the largest value of the count. Print it, or 0 when there are no intervals.

**Why it is right.** After the events up to and including a number `x` have been handled, the count is the number of intervals with `lo <= x` and `hi + 1 > x`, which is the number of intervals that hold `x`. Closing before opening at the same number means an interval that ends at `x - 1` is gone before one that starts at `x` comes in, so intervals that only touch are never counted together. The count changes only at events, so its largest value is the largest depth.

**Cost.** Sorting 2n events is O(n log n) in the **worst case** and the walk is O(n), so one `depth` is O(n log n) in the **worst case**, with O(n) extra space for the events.
