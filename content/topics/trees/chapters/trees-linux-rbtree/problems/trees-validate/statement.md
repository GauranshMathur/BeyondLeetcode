# Check the search rule

Nothing in the kernel's library compares keys, so nothing in it can check the order of a tree: the code that links the nodes is responsible for it. Write the check. The source for each claim is in [Binary search trees: why the kernel balances them](/chapters/trees-linux-rbtree).

Add:

| Command | What it does | Prints |
|---|---|---|
| `validate` | Checks the tree against the **search rule**: for every node, every value in its left subtree is smaller than the node's value and every value in its right subtree is larger. | `valid` or `invalid`; the empty tree is `valid` |

A value equal to the value of an ancestor is never allowed, on either side. The tree does not change.

## Example

Input:

```
tree 5 3 8 1 4 7 9
validate
tree 5 3 8 1 6
validate
```

Output:

```
valid
invalid
```

In the second tree, `6` is the right child of `3`, and `6` is larger than `3`, so the pair looks fine. But `6` is in the left subtree of `5`, and it is not smaller than `5`. Checking each node only against its parent would miss that.
