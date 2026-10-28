Check every node against the bounds its ancestors give it. Start with no bounds. At a node, the value must be larger than `low` and smaller than `high` (where they exist). Its left subtree gets `high` set to the node's value, and its right subtree gets `low` set to it. A bound only ever tightens as you go down, so a node is held to every ancestor, which is what a check against only the parent misses.

Every node is visited once, so it takes O(n) time in the **worst case**, and the recursion goes as deep as the tree is tall, O(h) stack. The values are compared strictly, so a repeated value on a path makes the tree invalid.

An equivalent check is an in-order walk (see the Chapter on traversals) that tests that the values strictly increase. A tree is a search tree exactly when its in-order walk is strictly increasing.
