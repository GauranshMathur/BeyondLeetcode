Keep two indexes, `low` and `high`, both **inclusive**, and the invariant that the key, if it is in the array, is at an index in `low..high`. Start with `low = 0` and `high = length - 1`. While `low <= high`, take `m = mid(low, high)`. If the item at `m` is below the key, everything up to `m` is too small, so `low = m + 1`. If it is above, `high = m - 1`. If it is equal, return `m`.

When the loop ends the range is empty. Every item before `low` is below the key and every item from `low` on is above it, so `low` is the insertion point, and `-(low + 1)` is the answer the statement asks for. For an empty array the loop never runs and the answer is `-1`.

The range shrinks to at most half its size on each pass, so a search makes at most `floor(log2 n) + 1` passes in the **worst case** (the key is absent, or is found on the last pass), and uses constant extra space. The tests include a 5,000-item array with 3,000 searches, which a search that went item by item makes slow.
