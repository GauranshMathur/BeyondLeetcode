Run the search of `cost` and keep a count for each node beside its total. `A` has count 1. When an offer from node `u` beats the best total for a node `v`, set `v`'s count to `u`'s count. When it ties, add `u`'s count to `v`'s. A node's count is complete when it is taken from the heap: every edge has weight 1 or more, so every route into it comes from a node with a smaller total, taken earlier, and any count a node `u` hands on is already final.

The cost is the search, O((V + E) log V) in the **worst case**, with the counts adding O(V) space. The counts can be large: a chain of `k` diamonds has 2^k cheapest routes. That is why the Tests stay below 10^15.

The RFC says OSPF uses such routes; this Problem only counts them.
