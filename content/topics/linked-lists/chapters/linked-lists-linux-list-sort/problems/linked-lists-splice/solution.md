Let `first` be `L`'s `next` and `last` be `L`'s `prev`. Given the two neighbours `prev` and `next` where the run goes:

1. `first.prev = prev`
2. `prev.next = first`
3. `last.next = next`
4. `next.prev = last`

Then `init L`, so that `L` does not still point into the moved nodes. `splice L H` uses `prev = H` and `next = H.next` (read it before writing); `splice_tail L H` uses `prev = H.prev` and `next = H`. If `L` is empty, skip everything: its `next` is `L`, so `first` and `last` would be the head, and the writes would corrupt the ring.

**Cost.** Four writes and a re-initialisation, however long the lists are: O(1) in the worst case. Copying the nodes one at a time with `add_tail` would cost O(n) in the worst case, for n nodes in `L`.
