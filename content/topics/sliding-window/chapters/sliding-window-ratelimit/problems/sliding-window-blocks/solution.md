Keep `total` for the current block. Add each item to it. Whenever the index plus one is a multiple of `K`, or the item was the last one, the block is complete: compare `total` with the best so far, then set `total` back to 0.

This is the kernel's counter. It holds one number and forgets everything at the edge of a period. Each item is read once, so time is O(n) in the worst case, and extra space is O(1): the running total and the best so far.

**What the counter misses.** In the example the burst of 12 is split 6 and 6. A counter that resets cannot see across the boundary. Put one more 0 in front, `load 0 0 0 6 6 0 0 1`, and the same burst falls inside one block, `6 6 0`, and `blocks 3` prints 12.
