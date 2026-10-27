**Adding.** In the function that links `N` between `prev` and `next`, test in the table's order with an `if` / `else if` chain, print `corrupt add: ...` for the first that holds, and only if none does make the four writes.

**Removing.** In the function that unlinks a node, read `prev` and `next`, test in the table's order, print `corrupt del: ...` for the first that holds, and only if none does make the two writes. `del` calls it and then writes 256 and 290; `del_init` calls it and then runs `init`. The poison writes and the re-initialisation sit outside the checked function, so they happen after a refusal too, which is what `list_del` and `list_del_init` do in the kernel.

**Why the order.** Reading `next`'s prev cell when `next` is 0 would read a made-up address, so the 0 tests come first, as in the kernel's tests. Poison tests come before the neighbour tests because a poisoned node's pointers are not neighbours at all.

**Cost.** A constant number of extra reads per command: O(1) in the worst case, the same as before.
