Keep `covered`, a flag per column, `chosen`, the row numbers chosen so far, and a counter `nodes`. The rows are lists of columns, in input order. A function `search()`:

1. add 1 to `nodes`; let `open` be the columns that are not covered; if there are none, print `chosen` sorted and stop;
2. let `usable` be the rows with no covered column;
3. for each open column count the usable rows that hold it, and let `col` be the open column with the smallest count, the lowest number on a tie;
4. for each usable row that holds `col`, in input order: set `covered` for each of its columns and add its number to `chosen` (**choose**), call `search()` (**explore**), then remove the number and clear those flags (**undo**).

Call `search()`, then print `nodes` and its value.

**Why it is right.** The choice of column does not lose answers: every answer covers `col` with exactly one row, and the loop tries every usable row that holds it. A usable row never touches a covered column, so the rows chosen never overlap. The undo restores `covered` to what it was before the row, so the loop's next row sees the same state. The fewest rule picks the column with the fewest branches, and a column with none ends the call at once.

**Cost.** Exact cover is hard: the search can be exponential in the **worst case**, whatever rule picks the column. With R rows, each call is O(R x C) to find the usable rows and the counts. What the rule changes is the number of nodes, as the Chapter shows, not that bound. Space is O(C + R) for the flags and the recursion.

The Reference Code counts the usable rows in a map from column to count, so that the choice of column is a single `min` with the number as the tie-break.
