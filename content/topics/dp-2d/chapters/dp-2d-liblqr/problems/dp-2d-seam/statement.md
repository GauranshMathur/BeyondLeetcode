# The cheapest seam

liblqr fills a grid of the cheapest cost of reaching each cell, and the cheapest seam is read from its last row ([the Chapter](/chapters/dp-2d-liblqr) reads how). The Build now also holds an **energy grid**, and you add the grid that finds the cost of the cheapest seam.

| Command | What it does | Prints |
|---|---|---|
| `grid R C e1 e2 ...` | Replaces the energy grid with `R` rows of `C` energies each, given row by row from the top, left to right. | nothing |
| `seam` | Finds the cheapest seam through the grid. | that seam's total energy |

`R` and `C` are between 1 and 100, and every energy is a whole number between 0 and 1000000. A **seam** has one cell in every row, from the top row to the bottom row. In the first row it may start in any column. In each next row its cell is in the same column as the cell above it or in the column just left or just right of it, and always inside the grid. Its total energy is the sum of the energies of its cells. The grid does not change, and `grid` and `seam` are separate from the two words: `words`, `show`, `common` and `trace` still have to work.

Trying every seam takes time exponential in `R`, and a grid of 100 rows has far too many. The Tests include grids of 100 rows and 100 columns.

## Example

Input:

```
grid 3 4 5 1 9 4 3 8 2 6 7 4 9 1
seam
grid 1 3 7 2 5
seam
```

Output:

```
4
2
```

The first grid is these three rows:

```
5 1 9 4
3 8 2 6
7 4 9 1
```

The cheapest seam starts at the 1 in the first row, steps down and right to the 2, and steps down and right to the 1 in the last row: 1 + 2 + 1 = 4. The second grid has one row, so a seam is one cell, and the cheapest is the 2.
