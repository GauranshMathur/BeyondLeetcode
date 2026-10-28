The counter lives in the comparison function, so it cannot miss a comparison: `less` adds one every time it runs.

`pop` now moves down the way `heapq` does. It opens a hole at the start index, and while the hole has a child it compares the two children (one comparison, none for a single child), moves the smaller up, and descends. At a leaf it puts the item in and calls the same move-up function that `push` uses. The array after every command is the same as with the textbook move. The smaller-child path from the hole only grows as it goes down, so the item ends up after the last key on that path that is smaller than it, whichever way that place is found.

Cost: a pop is O(log n) comparisons in the **worst case** either way. Going down costs at most ⌊log2 n⌋ comparisons of children, and going back up at most ⌊log2 n⌋ more. The saving is in the typical case.
