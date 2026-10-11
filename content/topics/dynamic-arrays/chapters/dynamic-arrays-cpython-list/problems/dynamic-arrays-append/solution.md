Three pieces of state are enough: the block, the length, and the capacity (which is just the size of the block).

`append` first checks whether the length equals the capacity. If it does, the block is full: make a new block of twice the size (or size 1 when the capacity is 0), copy every item from the old block into the same index of the new one, and keep the new block. Then write the new item at index `length` and add one to the length.

`get` must compare the index with the **length**, not the capacity. After three appends the block has four slots, and slot 3 holds a leftover 0 that is not part of the list.

Cost: `get` and `len` are O(1) in the worst case. `append` is O(n) in the worst case, when it has to copy, and O(1) amortised, because doubling makes those copies rare. The Chapter and the next Problem show why.

The Reference Code puts the copy in its own function, `move_to`, because every later Problem changes blocks through it.
