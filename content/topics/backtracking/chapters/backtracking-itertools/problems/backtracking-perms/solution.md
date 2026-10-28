Use the list from `load`, `n` for its length, and `size`, which is `R` when it is given and `n` otherwise. Keep `used`, a flag per position, and `current`, the items chosen so far. A function `fill()`:

1. if `current` has `size` items, print it in square brackets and stop;
2. for each position `i` from 0 to `n - 1`: skip it if `used[i]`; otherwise set `used[i]` and add `values[i]` to `current` (**choose**), call `fill()` (**explore**), remove the last item and clear `used[i]` (**undo**).

Call `fill()` once.

**Why it is right.** A path through the calls is a list of distinct positions, because a taken position is skipped, and every list of distinct positions of length `size` is a path. Each is printed once, so the output has n! / (n - R)! lines. At each place the loop goes by position, so lines come out in lexicographic order of their positions, which is the order required. `R` equal to 0 prints `[]` at once, and so does an empty list.

**Cost.** The tree has at most (R + 1) x n! / (n - R)! nodes, because the number of nodes at each depth grows with the depth, and each node scans n positions, so the run is O(n x (R + 1) x n! / (n - R)!) in the **worst case**. Printing a line costs O(R), which is inside this. Space is O(n) for the flags, the recursion and `current`.

The loop never builds an ordering with a repeated position, which is what makes it cheaper than listing every list of `R` positions and throwing out those with a repeat: that would look at n^R lists.
