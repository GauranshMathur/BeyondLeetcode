# One line per level

`bfs` lists the shallowest files first. Do the same to the tree: a **level** is all the nodes at the same depth, and the root is the only node at depth 0. The source for each claim is in [Walking a tree: Go goes deep, bfs goes wide](/chapters/trees-traversal).

Add:

| Command | What it does | Prints |
|---|---|---|
| `levels` | Visits the tree breadth-first, one level at a time, from the root down, and the nodes of a level from left to right. | one line per level, with its values separated by single spaces; nothing at all if the tree is empty |

The tree does not change.

## Example

Input:

```
tree 4 2 7 1 3 - 9
levels
```

Output:

```
4
2 7
1 3 9
```

`4` is alone at depth 0, `2` and `7` are at depth 1, and `1`, `3` and `9` are at depth 2. `7` has no left child, so `9` is the next node at depth 2 after `3`.
