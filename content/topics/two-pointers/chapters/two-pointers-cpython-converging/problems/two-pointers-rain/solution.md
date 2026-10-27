Keep `lo`, `hi`, and the tallest bar seen from each side, `left_max` and `right_max`. At each step, look at the lower of the bars at `lo` and `hi` (the left one if they are equal):

- if it is on the left, raise `left_max` to include it and add `left_max - height[lo]`, then move `lo` right;
- otherwise do the same on the right.

**Why it is right.** Let `M_right` be the tallest bar at positions `hi` and beyond, and `M_left` the tallest at positions `lo` and before. Claim: `left_max <= M_right` and `right_max <= M_left` at all times. Each time `lo` moves, the bar it leaves is no taller than `values[hi]`, which is at most `M_right`, and `M_right` can only grow as `hi` moves inward; the right side is the mirror. So when you add the water above the bar at `lo`, the tallest bar on its left is `left_max` (every bar before it has been seen), and the tallest on its right is at least `M_right`, which is at least `left_max`. The smaller of the two is `left_max`, which is the amount the sum adds. The right side is the mirror.

The loop stops with `lo == hi`, one bar left unprocessed. It holds no water: every bar a pointer has passed was no taller than the bar at the other pointer at that moment, and that bar was itself passed later or is the final one, so by following that chain, every passed bar is no taller than the final bar. The final bar is a tallest bar, and water never sits above a tallest bar.

Cost: one pointer moves per step, so O(n) in the worst case, and O(1) extra space. Precomputing the left and right maxima in two arrays is also O(n) time but O(n) extra space.
