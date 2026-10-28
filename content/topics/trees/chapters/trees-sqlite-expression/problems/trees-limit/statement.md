# Refuse a tree that is too tall

SQLite does not accept an expression tree taller than a limit, and it says so when the tree is built, before anything walks it. Make the Build do the same. The source for each claim is in [Expression trees: SQLite caps their depth](/chapters/trees-sqlite-expression).

Add:

| Command | What it does | Prints |
|---|---|---|
| `limit D` | Sets the largest height `tree` accepts. `D` is a whole number of at least 1, or the word `off`, which accepts any height. At the start there is no limit. | nothing |

`tree` changes. If the tree it would make is taller than the limit, `tree` prints `too deep` and leaves the current tree as it was. A tree exactly as tall as the limit is accepted. The empty tree is always accepted.

`limit` never changes the tree that is already there. It only decides what later `tree` commands may do.

## Example

Input:

```
limit 2
tree 5 3 8
height
tree 5 3 8 1
height
show
```

Output:

```
2
too deep
2
5 3 8
```

The tree `5 3 8` has height 2, which is the limit, so it is accepted. The next tree has height 3, so `tree` prints `too deep`, the tree stays `5 3 8`, and `height` and `show` still describe it.
