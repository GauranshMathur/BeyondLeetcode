# Three depth-first orders

Go's `fs.WalkDir` handles a directory before the files in it. A binary tree has two children, so there are three places to handle a node: before both children, between them, or after both. Print the tree in each order.

Add:

| Command | What it does | Prints |
|---|---|---|
| `walk pre` | Visits the tree **pre-order**: a node, then its left subtree, then its right subtree. | the values in that order, separated by single spaces; an empty line if the tree is empty |
| `walk in` | Visits it **in-order**: the left subtree, then the node, then the right subtree. | the same form |
| `walk post` | Visits it **post-order**: the left subtree, then the right subtree, then the node. | the same form |

The tree does not change.

## Example

Input:

```
tree 4 2 7 1 3 6 9
walk pre
walk in
walk post
```

Output:

```
4 2 1 3 7 6 9
1 2 3 4 6 7 9
1 3 2 6 9 7 4
```

The tree has `4` at the root, `2` and `7` below it, and `1 3 6 9` at the bottom. Pre-order writes each node before going down. In-order writes `2`'s subtree, then `4`, then `7`'s subtree: this tree is a search tree, so in-order gives its values in increasing order. Post-order writes every node after its children, so `4` comes last.
