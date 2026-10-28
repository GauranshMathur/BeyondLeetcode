`init` puts the keys in the array as they come and then repairs it from the bottom. The items from index `n / 2` on are leaves: item `i` has a child only when `2i + 1 < n`, which is `i <= n / 2 - 1` in whole-number division. So the loop runs from `n / 2 - 1` down to 0, and at each index it moves the item down. By the time the loop reaches an index, both subtrees below it are already heaps, so one move down makes a heap there too.

The move down now takes a start index. The hole opens at `i`, goes to a leaf, and the final move up stops at `i`. At index 0 it behaves as in `pop`.

Cost, with `n` items: O(n) comparisons in the **worst case**. An item at height `h` (the longest way down to a leaf) moves at most `h` rows, and at most ⌈n / 2^(h+1)⌉ items have height `h`. Adding up `h * n / 2^(h+1)` over all heights gives `n`, rounding aside, so the rows moved in total are about `n` at most, and each row costs at most 2 comparisons. Pushing the keys one at a time is O(n log n) in the **worst case**: with the keys in descending order every push climbs to the root.

The tickets continue from the counter. `init` also replaces the array, so nothing from before it is kept.
