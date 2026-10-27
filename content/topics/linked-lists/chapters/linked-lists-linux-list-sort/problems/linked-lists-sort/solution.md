Sort by recursion on first nodes. `sort(first)`:

1. if `first` is 0 or its next is 0, return `first`;
2. find the middle with a slow cursor that moves one node and a fast cursor that moves two; cut after the slow cursor by writing 0 into its next cell;
3. return `merge(sort(first), sort(second))`.

The merge is the stable merge of Problem 8, with the first half as `a`, so equal keys keep their order: the first half's nodes came first.

**Cost.** Each level of the recursion walks every node once (the split and the merge), and there are about log2(n) levels, so O(n log n) comparisons in the worst case. The extra space is the recursion depth, O(log n); no node is copied. The kernel's `list_sort` merges in a different order (it merges pairs of equal-sized runs as it goes, to keep the merges balanced and the working set small) but it produces the same stable result.
