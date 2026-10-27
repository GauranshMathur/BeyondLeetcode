**Unlinking.** Read `prev = P.prev` and `next = P.next`, then write `next.prev = prev` and `prev.next = next`, as `__list_del` does. Nothing needs the head, and nothing walks the list.

**Poison.** `del P` finishes with `P.next = 256` and `P.prev = 290`. `del_init P` finishes with `init P` instead, so the node is a valid empty list again and `empty P` says `yes`.

**Reverse walk.** `show_rev H` starts at `H.prev` and follows `prev` until it is back at `H`. It prints the same nodes as `show H`, in the opposite order.

**Cost.** `del` and `del_init` are O(1) in the worst case: a fixed number of reads and writes whatever the length of the list. `show_rev` is O(n) in the worst case, for a list of n nodes.
