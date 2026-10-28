Keep `current`, the items chosen so far, and a flag for whether anything was printed. A function `go(start, remaining)`:

1. if `remaining` is 0, print `current` in square brackets, note that something was printed, and stop;
2. for each position `i` from `start` to the end of the list: skip it if `values[i]` is bigger than `remaining`; otherwise add `values[i]` to `current` (**choose**), call `go(i, remaining - values[i])` (**explore**; the same position may be used again), then remove it (**undo**).

Call `go(0, T)`. If nothing was printed, print `none`.

**Why it is right.** Each path is a list of positions that never go down, because the next call starts at the position just used, and every such list whose items add up to `T` is reached. All items are positive, so `remaining` never reaches 0 on a path that has gone past it, and skipping items bigger than `remaining` loses no combination: nothing can be added to them. Printing as soon as `remaining` is 0 prints each combination once, since adding another item would overshoot. Positions are tried in increasing order, which is the order required.

**Cost.** Every item is at least 1, so a path has at most `T` items, and with n items there are at most n^T paths in the **worst case**, each stopped early by the skip: the pruning is why the real count is far lower. Space is O(T) for `current` and the recursion.
