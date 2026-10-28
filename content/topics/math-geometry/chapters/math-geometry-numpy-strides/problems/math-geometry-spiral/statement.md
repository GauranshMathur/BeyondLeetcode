# Read in a spiral

A view can be read in any order. Add a command that reads the whole matrix in a spiral.

| Command | What it does | Prints |
|---|---|---|
| `spiral` | Reads every item of the view once, clockwise, starting at the top-left item. It goes right along the top row, down the right column, left along the bottom row and up the left column, then repeats one layer further in, until every item is read. | all the items on one line, separated by single spaces |

It reads the view, not the block, so after `transpose`, `mirror` or `rotate` it spirals through the matrix as `show` displays it. Before the first `matrix` command it prints `error`.

## Example

Input:

```
matrix 3 3 1 2 3 4 5 6 7 8 9
spiral
```

Output:

```
1 2 3 6 9 8 7 4 5
```
