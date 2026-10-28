# Trace a word through a grid

A matcher has a text to walk along. Here the text is a grid of letters, and a word has to be traced through it, one neighbouring cell after another. Marking a cell as used is the choose, and clearing the mark is the undo, the same as the way CPython restores its marks between two alternatives ([code](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_sre/sre_lib.h#L365-L374)) in [CPython's regex engine: try an alternative, undo it, try the next](/chapters/backtracking-sre). This Problem is an Extra: it adds to the Build as it stands after `match`, and nothing it adds is in the later Problems.

Add:

| Command | What it does | Prints |
|---|---|---|
| `find WORD ROW1 ROW2 ...` | Looks for a path that spells `WORD` through the grid whose rows are `ROW1`, `ROW2`, and so on, top to bottom. | `no`, or `yes` followed by the cells of the first path, each as `row:column` counting from 0, each after a single space |

The word has 1 to 12 lowercase letters. The grid has 1 to 6 rows, all of the same length, 1 to 6 letters, lowercase. A **path** is a list of cells, one for each letter of the word in order, where each cell holds its letter, each cell after the first is **next to** the one before it (above, below, left or right, not diagonal), and no cell is used twice.

The **first** path is the one a search finds when it tries the start cells row by row, left to right in each row, and from each cell tries the neighbours in this order: up, right, down, left.

## Example

Input:

```
find sea sea
find see ab sd
find abd ab cd
```

Output:

```
yes 0:0 0:1 0:2
no
yes 0:0 0:1 1:1
```

In the first grid the single row `sea` spells the word along itself. In the second, no `e` exists, so the word `see` cannot be traced. In the third the word `abd` goes from `a` at row 0 and column 0 right to `b`, and down to `d`.
