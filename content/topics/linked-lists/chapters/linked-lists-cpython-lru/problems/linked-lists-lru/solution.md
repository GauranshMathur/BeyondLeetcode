Keep a ring with a head node `root` and a map from key to node. Entries are linked in order of use: `root.next` is the oldest, `root.prev` the newest.

- **Hit.** `node = map[K]`; unlink it; link it just before `root`; print `hit` and the result stored in the node. The `V` of the call is ignored.
- **Miss, with room** (`len(map) < C`): take a fresh node, write `K` and `V` into it, link it just before `root`, add it to the map; print `miss`.
- **Miss, full:** `node = root.next`; unlink it; delete its key from the map; print `miss evict` and that key; write `K` and `V` into the same node, link it before `root`, add it to the map. This is what CPython does: it reuses the link instead of freeing it and allocating a new one.
- **`order`** walks from `root.next` to `root` and prints each node's key.

**Cost.** Each call does a constant number of ring operations, O(1) in the worst case, and a constant number of map operations, O(1) expected. So a call is O(1) expected. `order` is O(n) for n entries.
