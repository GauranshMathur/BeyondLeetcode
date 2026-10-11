`pop` lowers the length by one and reads the slot it just gave up. The slot's old value can stay in the block: nothing can reach it, because `get` checks the length.

The shrink step reuses the function that replaces a block. That function already copies `length` items and counts them, so shrinking is counted like growing.

Two details are easy to miss. An empty list goes to capacity 0, not to `(0 + 0 + 6) & ~3 = 4`. And the formula can give back the capacity you already have (8 slots with 3 items left gives 8), in which case nothing moves and nothing is counted.

Why "below half" and not "as soon as a smaller block would do"? A list that grows at one length and shrinks at the next lower one can be made to change blocks on every single operation: append, pop, append, pop. With the half rule the list has to lose many items before it shrinks, and then gain many before it grows again, so the copies stay spread out. `pop` is O(n) in the worst case, when it moves the block, and O(1) amortised.
