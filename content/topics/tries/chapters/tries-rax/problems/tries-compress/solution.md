Count over the plain tree. Walk every node; for each node `p` that has exactly one child `c`, the child is absorbed if `c` has exactly one child and holds no value. Each absorbed node is counted once, from its parent, and the root has no parent, so it is never counted. The answer is the number of nodes minus the number absorbed.

Why this matches the rule: a node is absorbed when it has one child, is not a key, and its parent has one child. Looking from the parent, "the parent has one child" is the test on `p`, and "the node has one child and is not a key" is the test on `c`.

Check it on `ab` and `abcd`. The plain tree has 5 nodes: root, `a`, `ab`, `abc`, `abcd`. `a` is absorbed (one child, not a key, parent root has one child). `ab` is a key, so it is not. `abc` is absorbed (one child, not a key, its parent `ab` has one child). So 5 - 2 = 3 nodes: the root holding `ab`, then `ab` holding `cd`, then `abcd`.

Cost: one pass over the N nodes of the tree, O(N) per `rnodes`, and the same in the best and worst case. Nothing is stored, so there is no extra memory beyond the walk.
