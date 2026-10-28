# The height of the tree

SQLite keeps the height of every expression tree it builds, so it can refuse one that is too tall. You start the Build that holds the tree of this Topic. The source for each claim is in [Expression trees: SQLite caps their depth](/chapters/trees-sqlite-expression).

The Build reads commands from standard input, one per line, and works on one **binary tree** of integers. Blank lines are ignored. The tree starts empty. Commands that print, print one line.

| Command | What it does | Prints |
|---|---|---|
| `tree t1 t2 ...` | Replaces the tree with the one the tokens describe (below). With no tokens, the tree is empty. | nothing |
| `show` | Writes the tree out as tokens, in the same form. | the tokens, separated by single spaces; an empty line if the tree is empty |
| `height` | Measures the tree. | the number of nodes on the longest path from the root down to a node with no children; `0` if the tree is empty |

**Tokens.** Each token is an integer or `-`, which means "no node here". The first token is the root; a lone `-` is the empty tree. After that, each node that exists, in the order the tokens listed them, takes the next two tokens as its left child and its right child. When the tokens run out, every child still waiting is absent. The tokens always describe a whole tree: none is left over. `show` writes a tree in this form with the fewest tokens: it stops after the last node that exists, so it never ends with `-`.

Every integer in the Build, from here on (values, keys and limits), has an absolute value of at most 1,000,000,000. Values may repeat and may be negative.

## Example

Input:

```
tree 4 2 7 1 3 - 9
show
height
```

Output:

```
4 2 7 1 3 - 9
3
```

The root `4` has the children `2` and `7`. Node `2` has the children `1` and `3`. Node `7` has no left child and `9` as its right child. The longest path is `4`, `2`, `1` (or `3`, or `7`, `9`), three nodes, so the height is 3.
