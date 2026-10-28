# The lowest common ancestor

Git finds the best common ancestor of two commits, and the device tree library finds the ancestor of a node by counting depth. Find the lowest common ancestor of two values in the tree.

The **ancestors** of a node are the nodes on the path from the root down to it, and the node itself is one of them. The **lowest common ancestor** of two nodes is the deepest node that is an ancestor of both.

Add:

| Command | What it does | Prints |
|---|---|---|
| `lca a b` | Finds the node that holds `a` and the node that holds `b`, and then their lowest common ancestor. | the value of that node; `none` if the tree has no node with `a` or none with `b` |

When you use `lca`, you can rely on every value in the tree being different. `a` and `b` may be the same value. The tree is not changed, and it does not have to be a search tree.

## Example

Input:

```
tree 6 2 8 0 4 7 9 - - 3 5
lca 2 8
lca 3 5
lca 2 4
lca 5 5
lca 3 10
```

Output:

```
6
4
2
5
none
```

The tree has `6` at the root, `2` and `8` below it, then `0 4 7 9`, and `3` and `5` are the children of `4`. `2` and `8` meet only at the root. `3` and `5` meet at their parent `4`. `4` is below `2`, so `2` is an ancestor of both, and the deepest. A node is its own ancestor, so the answer for `5` and `5` is `5`. There is no `10`, so the answer is `none`.
