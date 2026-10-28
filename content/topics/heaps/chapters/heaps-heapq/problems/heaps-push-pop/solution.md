The heap is one array, and two moves keep it in order. **Moving up** takes the item at a position and, while it is smaller than its parent at `(p - 1) // 2`, puts the parent down into its place and climbs. **Moving down** takes the item at a position and, while a child is smaller, puts the smaller child up and descends. The comparison is one function: the key first, the ticket second. Because no two items are equal, the array is the same for every correct way of moving items.

`push` appends the item and moves it up from the last index. `pop` takes the last item out, and if the array is not empty puts that item at index 0, moves it down, and returns the old smallest. `peek`, `size` and `show` only read the array.

Cost, with `n` items: `push` and `pop` are O(log n) comparisons in the **worst case**, because an item travels at most one row per step and the heap has ⌊log2 n⌋ + 1 rows. The `append` inside `push` is amortised O(1). `peek` and `size` are O(1) in the **worst case**, and `show` is O(n) in the **worst case**.

The Reference Code keeps the array in a `Heap` with the two moves as methods, because every later Problem changes one of them or calls them from a new place.
