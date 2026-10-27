Count the list into `need`. Keep `have` (empty), `short = len(need)`, `lo = 0` and `best = 0`. For each index `hi` with value `v`:

1. if `v` is in `need`, add one to `have[v]`; if it now equals `need[v]`, subtract one from `short`;
2. while `short == 0`: record `hi - lo + 1` if it is smaller than `best` (or `best` is 0); let `u = values[lo]`; if `u` is in `need`, then if `have[u] == need[u]` add one to `short`, and subtract one from `have[u]`; add one to `lo`.

Print `best`.

**Why it is right.** `short` counts the hosts whose count in the window is below what the list needs, so the window covers the list exactly when it is 0. Comparing with `==` only at the moment a count crosses the needed number keeps `short` right when a host has more copies than needed. Look at one start `s`. Taking more items to the right never uncovers the list, so the shortest cover from `s` ends at the first `hi` where `s..hi` covers. The left edge does not pass `s` before that cover has been seen: `lo` only advances while the window `lo..hi` still covers, and when `lo` reaches `s` with `hi` at that first position, step 2 records `hi - s + 1` before it moves on. So the shortest cover from every start is recorded, and the best of those is the answer.

**Cost.** Each item enters once and leaves at most once, with a constant number of map operations each, O(1) in the **expected** case: O(n + m) expected for a sequence of n items and a list of m hosts. Extra space is O(m).
