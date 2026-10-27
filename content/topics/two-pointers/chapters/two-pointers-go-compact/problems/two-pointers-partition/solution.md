This is the loop from Go's `partitionOrdered`, with the pivot given as a value. Run the three steps of the procedure until `i > j`, and print `i`.

**Why `i` is the answer.** Whenever the loop stops, every item before `i` is smaller than `P` and every item after `j` is not. When the pointers have crossed (`i > j`), that covers all the items, and because `i` is exactly `j + 1`, the first `i` items are the smaller ones.

Cost: each pointer only moves toward the other and the swaps are at most n / 2, so O(n) time in the worst case and O(1) extra space. The order of items inside each side is not kept, which is why the Tests fix the procedure.
