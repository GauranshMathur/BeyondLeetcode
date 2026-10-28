Keep a grid of flags `used`, the same shape as the grid, and a list `path` of `row:column` cells. A function `walk(r, c, k)`, which answers whether the letters from the `k`th on can be traced starting at cell `(r, c)`:

1. if the cell is in use or its letter is not `word[k]`, answer no;
2. mark the cell in use and add it to `path` (**choose**);
3. if `k` is the last letter, answer yes;
4. for each neighbour in the order up, right, down, left that is inside the grid: if `walk` of it with `k + 1` answers yes, answer yes (**explore**);
5. remove the cell from `path` and clear its flag (**undo**), and answer no.

Try `walk(r, c, 0)` for each cell, row by row, left to right in each row; print `yes` and the path at the first success, and `no` if none.

**Why it is right.** The flags always match the cells on `path`, because a flag is set when a cell is added and cleared when it is taken off, except on a success, where the search ends. So no cell is used twice. Without the undo a failed branch would leave its cells marked, and a later branch that needs them would wrongly fail: the Tests include grids where that happens. The order of the tries is the order required, so the first success is the first path.

**Cost.** Each cell has up to 3 neighbours that are not the one it came from, so a word of L letters, with L at least 2, has at most 4 x 3^(L - 2) paths from each start cell. With R x C start cells that is O(R x C x 3^L) in the **worst case**, which is exponential in the word's length. Space is O(L) for the path and the recursion, plus O(R x C) for the flags.
