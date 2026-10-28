Swap the two children of a node, then mirror each child. A missing node ends the recursion. Every node is visited once, so it takes O(n) time in the **worst case**, and the recursion goes as deep as the tree is tall, O(h) stack. The order of the swap and the two calls does not matter, because the two calls cover the same two subtrees either way.

This Problem is optional: nothing in it is used by the Problems that follow.
