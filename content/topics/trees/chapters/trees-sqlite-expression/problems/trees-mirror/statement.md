# Mirror the tree

An optional Problem. It is the same recursion as the height, doing the job for both children, but the job is a change instead of a number.

Add:

| Command | What it does | Prints |
|---|---|---|
| `mirror` | Swaps the left and right child of every node, so the tree becomes its own mirror image. | nothing |

An empty tree stays empty.

## Example

Input:

```
tree 1 2 3 4 5 - 6
mirror
show
```

Output:

```
1 3 2 6 - 5 4
```

Before, node `1` had `2` on the left and `3` on the right, `2` had `4` and `5`, and `3` had no left child and `6` on its right. After the swap, `1` has `3` on the left and `2` on the right, `3` has `6` on the left and nothing on its right, and `2` has `5` on the left and `4` on its right.
