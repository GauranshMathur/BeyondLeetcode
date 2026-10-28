# Turn it inside the block

An **Extra Problem**: it branches off after `strides` and does not affect completing the Topic.

`rotate` turns the view and leaves the block alone. Sometimes the items themselves have to move, as the Chapter's last section says. Add a command that turns a square matrix a quarter clockwise by moving its items inside the block, with no second block and no copy of the matrix.

| Command | What it does | Prints |
|---|---|---|
| `spin` | Turns the matrix a quarter clockwise, by moving items inside the block. | nothing, or `error` |

`spin` works only on a square matrix whose view is the one `matrix` made: offset 0, row stride equal to the number of rows, and column stride 1. Otherwise (a matrix with different numbers of rows and columns, a view changed by `transpose`, `mirror` or `rotate` and not changed back, or no matrix yet) it prints `error` and changes nothing. After a `spin`, the view is still that standard view, `show` prints the turned matrix, and `block` prints the new block order.

## Example

Input:

```
matrix 3 3 1 2 3 4 5 6 7 8 9
spin
show
block
```

Output:

```
7 4 1
8 5 2
9 6 3
7 4 1 8 5 2 9 6 3
```
