Add one boolean to each node, "has been a map". When `add` creates a child and the node then has more than 8 children, set it. Nothing ever clears it, and `del` cuts a node out of the tree, which drops its flag with it, so a node that is created again later starts with the flag clear.

`shape` walks all the nodes, the root included. A node with the flag counts as a map. Otherwise a node with at least one child counts as a slice. A leaf that was never a map counts nowhere.

This is the choice Go makes in `mapping.add`: it appends to a slice while `len(h.s) < maxSlice`, and when the ninth pair arrives it builds a map and drops the slice. Nothing in that file turns the map back, which is why the flag is never cleared.

Cost: `add` and `del` stay as they were in Problem 1, O(L) expected for a key of L characters, and the flag adds O(1) to a step. `shape` is one pass, O(N) for N nodes.
