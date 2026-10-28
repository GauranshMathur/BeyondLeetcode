# Place the queens

Knuth's paper "Dancing Links" describes Dijkstra's program for the queens puzzle, which kept three arrays of flags and set and cleared one entry of each as it placed and took back a queen. This Problem builds that search. The reading is [Knuth's dancing links: a rule for where to branch](/chapters/backtracking-dlx).

Add:

| Command | What it does | Prints |
|---|---|---|
| `queens N` | Places `N` queens on an `N` by `N` board so that no two share a row, a column or a diagonal. Counts all the ways, and finds the first one. | the number of ways on one line; and, when the number is not 0, a second line with the first way: `N` column numbers separated by single spaces |

`N` is a whole number from 1 to 10. Two queens share a **diagonal** when the difference of their rows has the same size as the difference of their columns. A way is written as the column of the queen in row 1, then in row 2, and so on, with columns counted from 1. The **first** way is the one that comes first when the search places a queen in each row from the top, trying the columns from left to right in each row.

## Example

Input:

```
queens 4
```

Output:

```
2
2 4 1 3
```

There are two ways on a 4 by 4 board: `2 4 1 3` and `3 1 4 2`. The first one has the queen of row 1 in column 2, of row 2 in column 4, of row 3 in column 1 and of row 4 in column 3.
