# The tree seen from the right

An optional Problem. If you stood to the right of the tree and looked at it, from each level you would see only the last node. The levels you already print tell you which one it is.

Add:

| Command | What it does | Prints |
|---|---|---|
| `rightview` | Takes the rightmost node of each level, from the root down. | those values on one line, separated by single spaces; an empty line if the tree is empty |

The tree does not change.

## Example

Input:

```
tree 4 2 7 1 3 - 9
rightview
tree 1 2 3 4
rightview
```

Output:

```
4 7 9
1 3 4
```

In the first tree the levels are `4`, `2 7` and `1 3 9`, and the last values are `4`, `7` and `9`. In the second tree the levels are `1`, `2 3` and `4`. Node `4` is the left child of `2`, but it is the only node on its level, so it is the one you see.
