# Zero rows and columns

An **Extra Problem**: it branches off after `spiral` and does not affect completing the Topic.

Add a command that spreads zeros: every row and every column that holds a 0 becomes all zeros.

| Command | What it does | Prints |
|---|---|---|
| `zero` | Sets to 0 every item that is in a row or a column of the view that holds a 0. | nothing |

The rows and columns that count are those of the matrix when the command starts: the zeros the command itself writes do not spread any further. The command writes through the view: after `rotate`, it works on the rows and columns that `show` displays, and the block changes accordingly. Before the first `matrix` command it prints `error`.

Try to use no second matrix and no list of rows and columns, so that the extra space is O(1). The Tests cannot check this, but the Reference Code does it, and the Solution explains how.

## Example

Input:

```
matrix 3 3 1 2 3 4 0 6 7 8 9
zero
show
```

Output:

```
1 0 3
0 0 0
7 0 9
```
