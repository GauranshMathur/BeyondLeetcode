Let `prev = 0` and `cur` be the head's first node. While `cur` is not 0:

1. `nxt = cur.next`
2. `cur.next = prev`
3. `prev = cur`
4. `cur = nxt`

Finally the head's cell gets `prev`, the old last node. After the loop every link points the other way. (This is an argument from the pointers, not something taken from a source.)

**Cost.** Each node is visited once: O(n) time in the worst case, and O(1) extra space: three variables, whatever the length. Note what `sdel` reports afterwards: the nodes that were last are now first, so they cost 0 hops.
