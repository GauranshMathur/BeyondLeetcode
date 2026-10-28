One recursive function handles the three orders. It calls itself on the left child and then on the right child, and the only difference is when the node's own value is written: before both calls (pre-order), between them (in-order), or after both (post-order). A missing child ends the recursion.

Each node is visited once, so every order takes O(n) time in the **worst case**. The recursion goes as deep as the tree is tall, so the stack needs O(h) space for height h, and a chain of n nodes needs O(n). That is the cost of depth-first the Chapter compares with a queue.
