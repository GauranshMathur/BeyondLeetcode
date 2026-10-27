Keep `last`, a map from value to the index of its latest appearance, `lo = 0` and `best = 0`. For each index `i` with value `v`: if `v` is in `last` and `last[v] >= lo`, set `lo = last[v] + 1`. Then set `last[v] = i` and `best = max(best, i - lo + 1)`.

**Why it is right.** The window is `values[lo..i]` and it never holds a repeat. When `v` comes in, the only way it can repeat something is a copy at `last[v]`, and only if that copy is still inside the window. The nearest fix is to start just after that copy, and any start further left would still hold both copies. A copy before `lo` is no longer in the window, which is why the `last[v] >= lo` check is needed: without it, `lo` would move backwards.

An equivalent version keeps a map of counts and, when `v` enters, moves `lo` right one step at a time, taking each item out of the counts, until `v` has a count of 1. This one lets `lo` jump.

**Cost.** One pass, one map lookup and one write per item. Each is O(1) in the **expected** case, so the run is O(n) expected. The map holds at most one entry per distinct value, so extra space is O(d) where d is the number of distinct values. Checking every run is O(n²) in the worst case, and the largest Hidden Tests have thousands of items.
