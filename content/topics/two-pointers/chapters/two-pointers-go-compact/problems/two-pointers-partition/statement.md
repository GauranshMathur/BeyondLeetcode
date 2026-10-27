# Partition around a pivot

The sort in Go's standard library partitions with two pointers that start at the ends of the slice and swap items that are on the wrong side. Here the pivot is a value you are given, not an item of the sequence.

Add:

| Command | What it does | Prints |
|---|---|---|
| `partition P` | Rearranges the sequence in place so that every item smaller than `P` comes before every item that is not smaller than `P`. Follows the exact procedure below. | the number of items smaller than `P` |

**The procedure.** Set `i = 0` and `j = n - 1`. Repeat:

1. while `i <= j` and the item at `i` is smaller than `P`, add 1 to `i`;
2. while `i <= j` and the item at `j` is not smaller than `P`, subtract 1 from `j`;
3. if `i > j`, stop; otherwise swap the items at `i` and `j`, add 1 to `i` and subtract 1 from `j`, and go back to step 1.

The Tests check the order of the items after `partition`, so the swaps have to be these swaps. Print `i` when you stop.

## Example

Input:

```
load 5 1 8 3 9 2
partition 5
show
```

Output:

```
3
2 1 3 8 9 5
```

The first scans stop at the 5 on the left (not smaller than 5) and at the 2 on the right (smaller than 5), and swap them. Then the left scan skips the 1 and stops at the 8, and the right scan skips the 9 and stops at the 3; they swap. Now `i` is 3 and `j` is 2, so the pointers have crossed: 3 items are smaller than 5.
