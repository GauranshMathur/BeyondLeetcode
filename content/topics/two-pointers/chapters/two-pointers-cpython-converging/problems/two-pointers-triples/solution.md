For each position `first` from 0 to n - 3, skip it if its value equals the one before it. Set `lo = first + 1` and `hi = n - 1` and run the converging search for a sum of 0:

- `total < 0`: move `lo` right;
- `total > 0`: move `hi` left;
- `total == 0`: count one, move `lo` right and `hi` left, then keep moving `lo` right while it equals the item just before it.

Skipping repeated first items and repeated left items is what makes each value triple count once. Repeats on the right are passed over by the same step: after a hit, `hi` has moved and `lo` has moved, so the same pair cannot be found twice.

Cost: n first positions, each with a pass of at most n steps, so O(n^2) in the worst case, and O(1) extra space. Sorting, if it were needed, adds O(n log n), which does not change the bound.
