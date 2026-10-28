# Insert and find in a search tree

The kernel's red-black tree is a binary search tree, and the walk that inserts or finds a key is a loop the caller writes. Write that loop.

Add:

| Command | What it does | Prints |
|---|---|---|
| `insert v1 v2 ...` | Adds each value in turn. For one value, start at the root. If the value is smaller than the node's, go to the left child; if it is larger, go to the right child; if it is equal, stop and add nothing. Where there is no child to go to, create a node with the value there. If the tree is empty, the value becomes the root. | nothing |
| `find v` | Searches for `v` the same way and changes nothing. | `found N` if a node holds `v`, otherwise `missing N`, where `N` is the number of nodes `v` was compared with (`0` for an empty tree) |

With no values, `insert` does nothing. Both commands follow the rule on whatever tree is there, including one loaded by `tree` that is not a search tree. There is no balancing: the shape depends only on the order of the values.

## Example

Input:

```
insert 4 2 6 1 3 5 7
show
height
find 5
find 8
```

Output:

```
4 2 6 1 3 5 7
3
found 3
missing 3
```

`4` is the root, `2` and `6` go on its two sides, and `1`, `3`, `5` and `7` fill the level below, so the height is 3. Searching for `5` compares it with `4`, then `6`, then `5`: three nodes. Searching for `8` compares it with `4`, `6` and `7`, and then there is no right child to go to: three nodes, and it is missing.

Now the same seven values in increasing order:

```
insert 1 2 3 4 5 6 7
height
find 7
```

```
7
found 7
```

Each value is larger than all the ones before it, so each goes to the right of the last one and the tree is a chain. Finding `7` compares it with all seven.
