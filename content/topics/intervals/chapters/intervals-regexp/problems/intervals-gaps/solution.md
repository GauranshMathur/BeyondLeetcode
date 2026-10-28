Merge the intervals as in `merged`. Keep `next = lo`, the first number of the window that is not yet known to be held or in a gap. For each merged interval `a-b` in order: skip it if `b < next`, stop if `a > hi`, otherwise, if `a > next`, the numbers `next` to `a - 1` are a gap, and then set `next = b + 1`. After the loop, if `next <= hi`, the numbers `next` to `hi` are the last gap. Print the gaps, or `none` if there were none.

**Why it is right.** The merged intervals are in order and do not touch, so the numbers between two neighbours are held by no interval, and there is at least one of them. Walking in order with `next` means every number below `next` is already settled. A gap never reaches beyond the window because the first gap starts at `next >= lo` and the last one stops at `hi`.

**Cost.** Merging is O(n log n) in the **worst case**, and the walk is O(n), so one `gaps` is O(n log n) in the **worst case**. Extra space is O(n).
