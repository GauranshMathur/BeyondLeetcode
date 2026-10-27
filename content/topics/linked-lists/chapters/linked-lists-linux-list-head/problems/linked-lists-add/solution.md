**Linking.** Insert between two known neighbours, exactly as `__list_add` does:

1. `next.prev = new`
2. `new.next = next`
3. `new.prev = prev`
4. `prev.next = new`

`add N H` calls it with `prev = H` and `next = H.next`. `add_tail N H` calls it with `prev = H.prev` and `next = H`. Because the head is a node in the ring, an empty list needs no special case: its `prev` and `next` are both the head.

**The rest.** `init P` writes `P` into both of its cells. `empty H` compares `H`'s `next` with `H`. `show H` follows `next` from `H`'s `next` until the cursor equals `H`, collecting addresses.

**Cost.** `init`, `add`, `add_tail` and `empty` make a fixed number of reads and writes: O(1) in the worst case. `show` visits every node once: O(n) in the worst case, for a list of n nodes.
