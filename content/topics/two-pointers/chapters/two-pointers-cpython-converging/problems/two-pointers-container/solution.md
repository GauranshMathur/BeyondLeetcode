Start with `lo = 0` and `hi = n - 1`. Measure `(hi - lo) * min(values[lo], values[hi])`, keep the best, then move the pointer at the shorter wall inward (either one if they are equal).

**Why the shorter wall.** Every pair that still uses the shorter wall as one end is narrower than the current pair, and its height is capped by that same shorter wall. So none of them can beat the current pair, and the shorter wall can be dropped for good. This is a different reason to move a pointer than the order in `pairsum`: here the reason is an upper bound, not sortedness.

Cost: each step moves one pointer, so at most n - 1 steps: O(n) in the worst case, O(1) extra space. Trying every pair is O(n^2).
