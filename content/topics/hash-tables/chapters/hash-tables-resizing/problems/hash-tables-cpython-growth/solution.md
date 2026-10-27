The check sits in `put`, after the search has decided the key is new and before it looks for a free slot. If it fires, `rebuild` runs and the free-slot search then runs against the new table.

`rebuild` throws the old slots away and keeps only the rows. The live rows are copied in order, which keeps the insertion order, and the empty rows disappear, which is why `nentries` drops. Each live row is placed again with the same search rule; there are no Dummy slots, so a slot is free if it is Unused.

The new size is `3 * used` rounded up to a power of two, with a minimum of 8. CPython 3.13.0 computes the rounding as `(minsize | 8) - 1`, then the bit length of that with the low three bits set. For `minsize` below 8 that gives 16, which is the odd case in the statement. A later release fixed it.

With no deletions a rebuild happens when there are `floor(2N / 3)` keys and gives `N * 2`: doubling. A rebuild is O(n) worst case; the puts since the last rebuild pay for it, so `put` is O(1) amortised. Deletions make it come sooner, because deleted rows are only cleared by a rebuild.
