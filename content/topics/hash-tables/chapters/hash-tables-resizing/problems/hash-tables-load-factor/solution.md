The new check goes at the end of `put`, for new keys only: if resizing is on and the number of keys is greater than `N * 3 / 4` (rounded down), call the same resize function. Counting moves belongs in that function, so the 9-node rule's resizes are counted too.

The cost: one resize is O(n) in the worst case. It is paid rarely. After a resize at `t + 1` keys the table has twice the bins and so twice the threshold, so the next resize is about `t` puts away. The keys moved add up to at most about twice the puts. That is O(1) amortised per put, the argument from the Dynamic arrays Topic applied to a table.

Notice that `longest` is now small on average too: with a threshold of 3/4 of the bins, the average chain has under one node.
