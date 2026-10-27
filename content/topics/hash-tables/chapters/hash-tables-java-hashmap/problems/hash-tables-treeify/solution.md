After appending a new node, look at the bin. If it is not a tree bin and holds 9 or more nodes, there are two answers. Below 64 bins, double the table: this is what `treeifyBin` does in the source, because a short table is the likelier cause of a long chain. At 64 bins or more, mark the bin as a tree bin.

The resize splits each chain by one bit. Because the new mask is the old mask plus the bit `M`, a node's new bin is either its old bin or its old bin plus `M`. Walking the old chain in order and appending to one of two new lists keeps each chain's order.

Keys that differ only in bits above the mask cannot be separated by a small table. If every key is a multiple of 512 and below 65536, their spread hash is the key itself and they all stay in bin 0 however the table doubles up to 64 bins. The next put into that bin turns it into a tree.

A resize costs O(N + n) for a table of `N` bins and `n` keys: it visits every bin and places every node. That is a worst-case cost for the put that triggers it. The puts before it share the cost, which the next Problem counts.
