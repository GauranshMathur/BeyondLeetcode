Move `lo` right while the item at `lo` is 0. Then move `hi` left while `hi > lo` and the item before `hi` is 0. The kept part is `lo` up to `hi`; the number removed is the old length minus the kept length.

The guard `hi > lo` is the one in `do_strip` (`j >= i`). With it, an all-zero sequence ends with `lo == length`, `hi` never moves, and the kept part is empty. Without it, `hi` could walk back across items `lo` already passed.

Each item is read at most once by the two scans, plus the item where each stops, so time is O(n) in the worst case, which is an all-zero sequence. Extra space is O(1) when you shrink the sequence in place. (CPython returns a new string because strings cannot change; here the sequence can.)
