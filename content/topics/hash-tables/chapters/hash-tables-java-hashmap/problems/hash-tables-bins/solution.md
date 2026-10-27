Finding the bin is `(key ^ (key >> 16)) & (N - 1)`. Everything else is a walk over a list. `put` walks the chain: if it meets the key it replaces the value, and if it reaches the end it appends there. Appending at the end is what Java does, and `dump` shows it.

One helper that walks a chain and returns the node and the visit count serves `get` and `probes`.

The expected cost of `put` and `get` is O(1) when keys spread evenly, because chains are short. The worst case is O(n), when every key falls in one bin. The next Problem is what Java does about that.
