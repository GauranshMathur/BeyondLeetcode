Split the sequence into `newer = values[:K]` and `older = values[K:]`, with one index `i` into `newer` and one `j` into `older`. While either run has items left:

- if `newer` has an item left and either `older` is exhausted or `newer[i] <= older[j]`: take `newer[i]` (record `N`). If `older` has an item left with the same key, skip it too (`j` moves on): it is hidden by the newer entry. Then `i` moves on.
- otherwise (`newer` is exhausted, or `older[j] < newer[i]`) take `older[j]` (record `O`) and move `j`.

The comparison `newer[i] <= older[j]` makes the newer run win a tie. Compare LevelDB, where the order puts the newest entry for a key first and the compaction loop drops the rest: here both decisions sit in one loop.

Cost: every step moves at least one index forward and never back, and each item is output at most once, so O(m + n) time in the worst case for runs of m and n items, and O(m + n) extra space for the merged output.
