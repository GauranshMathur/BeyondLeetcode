# Save the tree as text and restore it

The flattened device tree writes a tree as a list of tokens that begin and end each node. Give the Build a text form of its own with the same idea, and a way to read it back. The source for each claim is in [Flat trees and common ancestors: the device tree and git](/chapters/trees-flat-tree).

The text of a tree is:

- `.` for the empty tree;
- otherwise `(`, the node's value, a single space, the text of its left subtree, a single space, the text of its right subtree, and `)`.

So a node with value `5` and no children is `(5 . .)`, and `5` with a left child `3` is `(5 (3 . .) .)`. There are no other spaces.

Add:

| Command | What it does | Prints |
|---|---|---|
| `save` | Writes the tree as text. | the text on one line; `.` for an empty tree |
| `restore TEXT` | Replaces the tree with the one in `TEXT`, which is the rest of the line after `restore` and one space. | nothing |

`restore` is only given text that `save` could have printed. It obeys `limit` exactly as `tree` does: if the tree is taller than the limit, it prints `too deep` and leaves the current tree as it was.

## Example

Input:

```
tree 5 3 8 - 4
save
restore (7 (2 . .) .)
show
save
```

Output:

```
(5 (3 . (4 . .)) (8 . .))
7 2
(7 (2 . .) .)
```

The tree `5 3 8 - 4` has `5` at the root, `3` and `8` below it, and `4` as the right child of `3`, which is why `3` is written as `(3 . (4 . .))`: nothing on the left, then the node `4`. The restored tree is `7` with `2` on its left, so `show` gives `7 2` and `save` writes it back as it came in.
