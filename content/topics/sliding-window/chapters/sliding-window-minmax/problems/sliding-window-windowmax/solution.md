Let `k = min(K, n)`. Keep a queue `q` of indices, empty. For each `i`:

1. while `q` is not empty and `values[q.back] <= values[i]`, remove `q.back`;
2. add `i` at the back;
3. if `q.front <= i - k`, remove `q.front` (it has left the window);
4. if `i >= k - 1`, output `values[q.front]`.

**Why it is right.** The queue always holds, in order of arrival, the indices of the items in the window that are bigger than everything after them. Those are the only items that can still become a window's maximum: an item that is not bigger than a later one in the window will leave first. Because the values in the queue decrease from front to back, the front is the largest item in the window. At most one front item leaves per step, since the window moves by one.

**Cost.** Each index is added once and removed at most once, so the loops do at most 2n steps: O(n) in the **worst case** in total, amortised O(1) per item, though one step can remove up to `K` indices. The queue holds up to `K` indices when the items are strictly decreasing (`K + 1` for a moment, between step 2 and step 3), so extra space is O(K) in the **worst case**. Taking the maximum of each window again from scratch is O(n × K) in the worst case.

An equal item at the back is removed too (`<=`), so the queue is strictly decreasing and holds the newer of two equal items. Either choice gives the same maxima, and removing equal items keeps the queue shorter.
