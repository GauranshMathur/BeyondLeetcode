Zeros the command writes must not spread, so the command first records which rows and columns hold a zero, and only then writes. The matrix's own first row and first column are the record: after the first pass, `(i, 0)` is 0 when row `i` held a zero, and `(0, j)` is 0 when column `j` did.

```
first_row = any item in row 0 is 0
first_col = any item in column 0 is 0
for i, j from 1:   if a[i][j] == 0: a[i][0] = 0; a[0][j] = 0
for i, j from 1:   if a[i][0] == 0 or a[0][j] == 0: a[i][j] = 0
if first_row: set row 0 to 0
if first_col: set column 0 to 0
```

The notes in the first row and column overwrite items, which is why two variables remember, before the first pass, whether row 0 and column 0 held a zero of their own. The first row and column are cleared last, so that the second pass can still read their notes.

Every item is read a constant number of times, so the time is O(R x C) in the worst case. Extra space is O(1): two variables. Reading and writing go through the view, so the same code zeroes a matrix after `rotate`.
