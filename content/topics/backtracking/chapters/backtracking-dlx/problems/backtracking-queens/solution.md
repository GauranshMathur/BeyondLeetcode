Keep three arrays of flags, as in Dijkstra's program: `cols` with N entries, and `diag` and `anti` with 2N - 1 entries each. A queen at row `r` and column `c` (counted from 0) uses `cols[c]`, `diag[r + c]` and `anti[r - c + N - 1]`. Keep `placed`, the columns so far, counted from 1, a counter of ways, and a copy of the first way.

A function `place(row)`:

1. if `row` is `N`, add 1 to the counter and, if this is the first way, copy `placed`; stop;
2. for each column `c` from 0 to `N - 1`: skip it if any of its three flags is set; otherwise set the three flags and add `c + 1` to `placed` (**choose**), call `place(row + 1)` (**explore**), then remove the last item of `placed` and clear the three flags (**undo**).

Call `place(0)`, print the counter, and print the first way if there is one.

**Why it is right.** The three flags are the whole rule: two queens share a column, a `\` diagonal or a `/` diagonal exactly when they share the matching flag, and rows differ because each row gets one queen. Clearing the flags on the way back makes them describe only the queens in `placed`. Trying columns left to right in each row, from the top, meets the ways in order, so the first way found is the one required.

**Cost.** A path never repeats a column, so there are at most N! complete paths, and each node scans N columns, so the search is O(N x N!) in the **worst case**; the flags cut it to far fewer nodes, because a path stops as soon as a square is attacked. Each check and each flag change is O(1) in the **worst case**. Space is O(N).

The Reference Code does the three flag changes in one line each way, so that choose and undo stay a mirror of each other.
