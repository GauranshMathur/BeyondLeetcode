Count the list into `need`. Keep `have` (empty), `short = len(need)`, `lo = 0` and `best = 0`. For each index `hi` with value `v`:

1. if `v` is in `need`, add one to `have[v]`; if it now equals `need[v]`, subtract one from `short`;
2. while `short == 0`: record `hi - lo + 1` if it is smaller than `best` (or `best` is 0); let `u = values[lo]`; if `u` is in `need`, then if `have[u] == need[u]` add one to `short`, and subtract one from `have[u]`; add one to `lo`.

Print `best`.

**Why it is right.** `short` counts the hosts whose count in the window is below what the list needs, so the window covers the list exactly when it is 0. Comparing with `==` only at the moment a count crosses the needed number keeps `short` right when a host has more copies than needed. For each `hi`, step 2 removes items from the left for as long as the window still covers, recording the length each time, so the shortest cover ending at `hi` is recorded.

**Cost.** Each item enters once and leaves at most once, with a constant number of map operations each, O(1) in the **expected** case: O(n + m) expected for a sequence of n items and a list of m hosts. Extra space is O(m).
