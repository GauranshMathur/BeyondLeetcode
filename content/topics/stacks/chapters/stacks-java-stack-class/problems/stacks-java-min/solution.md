Keep a second stack, `mins`, with one entry per item. The entry for an item is the smallest value among that item and everything below it: when pushing `x`, push `x` if `mins` is empty, and otherwise the smaller of `x` and the top of `mins`. When popping an item, pop `mins` too. The top of `mins` is then the answer to `min`.

Why not one number? If you only remembered the smallest value, popping it would leave you not knowing the next smallest without looking through the items. The entry under each item remembers what the minimum was before that item arrived, so popping restores it.

Equal values need no special care. Pushing 2 and then another 2 gives two entries of 2, and popping one leaves the other.

Complexity. `min` is O(1) in the **worst case**. `push` and `pop` do the same work as before plus one push or pop on `mins`, so their costs do not change, and the extra memory is O(n).
