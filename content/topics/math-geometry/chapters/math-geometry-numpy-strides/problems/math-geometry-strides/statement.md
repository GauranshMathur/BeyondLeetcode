# A matrix of strides

The Build now holds a matrix, stored as NumPy stores one in the Chapter. Keep the items in a **block**, a flat list, in the order they were given, row by row. Describe how the matrix is read with a **view**: how many rows and columns it shows, the position in the block of its item (0, 0) (the **offset**), the **row stride** (how far to move in the block to go down one row), and the **column stride** (how far to move to go right one column). Item `(i, j)` of the view is the block item at position `offset + i * row stride + j * column stride`. The Chapter counts strides in bytes. The Build counts items.

| Command | What it does | Prints |
|---|---|---|
| `matrix R C v...` | Replaces the matrix with one of `R` rows and `C` columns. The `R * C` items follow on the same line, row by row; they go into the block in that order. The view is the whole matrix: offset 0, row stride `C`, column stride 1. | nothing |
| `at I J` | Reads item `(I, J)` of the view. | the item, or `error` if `I` is below 0 or not below the view's rows, or `J` is below 0 or not below its columns |
| `shape` | Reads the view's size. | the rows and the columns, separated by one space |
| `show` | Reads the whole view. | one line for each row of the view, its items separated by single spaces |
| `block` | Reads the block as it is stored. | all the block's items on one line, separated by single spaces |
| `transpose` | Swaps rows and columns of the view: swap the two sizes, and swap the two strides. | nothing |
| `mirror` | Reverses each row of the view: add `(columns - 1) * column stride` to the offset, then negate the column stride. | nothing |
| `rotate` | Turns the view a quarter clockwise: `transpose`, then `mirror`. | nothing |

`R` and `C` are from 1 to 50, and the items are whole numbers from -1,000,000,000 to 1,000,000,000. Before the first `matrix` command, every other command in the table prints `error` (`show` prints one `error` line).

`transpose`, `mirror` and `rotate` change only the view: they must not move or copy any item, so `block` prints the same line after them as it did right after `matrix`.

## Example 1

Input:

```
matrix 2 3 1 2 3 4 5 6
show
shape
transpose
show
shape
block
at 2 1
at 2 2
```

Output:

```
1 2 3
4 5 6
2 3
1 4
2 5
3 6
3 2
1 2 3 4 5 6
6
error
```

## Example 2

Input:

```
matrix 2 2 1 2 3 4
rotate
show
block
```

Output:

```
3 1
4 2
1 2 3 4
```

In the second example, the turned matrix reads `3 1` and `4 2`, while the block still reads `1 2 3 4`.
