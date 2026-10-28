The state is the block and five numbers: rows, columns, offset, row stride, column stride. `matrix` sets the block and starts the view at (offset 0, row stride `C`, column stride 1). The rest is arithmetic on the numbers, and the block is never written.

```
at(i, j)    = block[offset + i * rowStride + j * colStride]
transpose:    swap rows and cols; swap rowStride and colStride
mirror:       offset = offset + (cols - 1) * colStride
              colStride = -colStride
rotate:       transpose; mirror
```

Why `rotate` is a clockwise turn. After the transpose, the view's item `(i, j)` is the old `(j, i)`. After the mirror, it is the transposed view's `(i, c - 1 - j)`, where `c` is the transposed view's column count, which is the old row count `R`. So the new item `(i, j)` is the old `(R - 1 - j, i)`. That is a quarter turn clockwise: the old bottom-left item ends up at the top-left. It is the composition NumPy's `rot90` uses for its clockwise case, as the Chapter shows. Four `rotate` commands in a row give the view you started from.

Two things catch people. First, `mirror` changes the offset as well as the stride: with a negative column stride, row 0 must start at the last column's position. Second, `at` and `show` must use the view's rows and columns after a `transpose`, which differ from the matrix you loaded unless it was square.

Cost: `at`, `shape`, `transpose`, `mirror` and `rotate` are O(1) in the worst case, and none of them touches the block. `matrix`, `show` and `block` are O(R x C). Extra space is O(1) beyond the block.
