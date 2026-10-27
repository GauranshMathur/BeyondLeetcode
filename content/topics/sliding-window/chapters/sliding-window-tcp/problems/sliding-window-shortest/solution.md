Keep `lo = 0` and `total = 0`. For each index `hi`: add `values[hi]` to `total`. While `total >= S`, record `hi - lo + 1` if it is smaller than the best so far (or if there is no best yet), then subtract `values[lo]` and add one to `lo`. Print the best, or 0 if none was found.

**Why it is right.** For each `hi`, the inner loop removes items from the left for as long as the run still reaches `S`, and it records the length at each step, so it records the shortest run that ends at `hi`. Because every item is positive, `S` is at least 1 and a run that reaches `S` cannot be empty, so the loop never moves `lo` past `hi`. The shortest run overall ends at some `hi`, so it is among those recorded.

**Cost.** Each index enters the window once and leaves it at most once: at most 2n steps, so O(n) in the **worst case**, with O(1) extra space. Starting a run at every position and extending it until it reaches `S` is O(n²) in the **worst case**.
