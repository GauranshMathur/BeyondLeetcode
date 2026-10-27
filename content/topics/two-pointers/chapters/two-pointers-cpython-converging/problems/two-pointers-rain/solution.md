Keep `lo`, `hi`, and the tallest bar seen from each side, `left_max` and `right_max`. At each step, look at the lower of the bars at `lo` and `hi` (the left one if they are equal):

- if it is on the left, raise `left_max` to include it and add `left_max - height[lo]`, then move `lo` right;
- otherwise do the same on the right.

**Why it is right.** The bar at `lo` is no taller than the bar at `hi`, so the tallest bar on its right side is at least as tall as `values[hi]`, which is at least `values[lo]`. Hence the right-hand maximum cannot be what limits the water above `lo`; only `left_max` can. The right side is the mirror.

Cost: one pointer moves per step, so O(n) in the worst case, and O(1) extra space. Precomputing the left and right maxima in two arrays is also O(n) time but O(n) extra space.
