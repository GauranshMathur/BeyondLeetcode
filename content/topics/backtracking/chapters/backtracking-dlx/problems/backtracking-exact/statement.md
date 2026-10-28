# Exact cover, fewest first

Knuth's paper "Dancing Links" solves exact cover by choosing, at each step, the column that has the fewest rows to choose from, and measures how much that shrinks the search tree on its pentomino puzzle ([page 4](https://arxiv.org/pdf/cs/0011047v1#page=4), [page 5](https://arxiv.org/pdf/cs/0011047v1#page=5)). This Problem makes you do the same and count the nodes. The reading is [Knuth's dancing links: a rule for where to branch](/chapters/backtracking-dlx). This Problem is an Extra: it adds to the Build as it stands after `queens`, and nothing it adds is in the later Problems.

Add:

| Command | What it does | Prints |
|---|---|---|
| `exact C ROW1 ROW2 ...` | Finds every set of rows that covers each of the columns 1 to `C` exactly once, with the search below. | one line per set, in the order the search finds them: the row numbers in increasing order, separated by single spaces; then a last line, `nodes N`, with the number of nodes the search made |

`C` is from 1 to 12. Each row is written as its column numbers, separated by commas and no spaces, such as `3,5,6`: different numbers from 1 to `C`. There are at most 30 rows, numbered from 1 in the order they are written. A set **covers** each column exactly once when every column from 1 to `C` is in exactly one of its rows. There may be no rows at all, or no set.

The search is a function that counts one **node** each time it is called:

1. count a node. The **open** columns are the ones no chosen row has covered yet. If there are none, print the chosen rows, in increasing order, and return;
2. the **usable** rows are the ones that have no column that is already covered;
3. for each open column, count the usable rows that hold it. Take the open column with the **fewest** (the lowest number if several tie), even if the count is 0;
4. for each usable row that holds that column, in the order written: choose it, which covers its columns, call the search, and undo the choice.

The search starts with no rows chosen.

## Example

This is the example matrix of the paper ([page 2](https://arxiv.org/pdf/cs/0011047v1#page=2)), with the seven columns A to G ([page 5](https://arxiv.org/pdf/cs/0011047v1#page=5)) numbered 1 to 7, and its six rows.

Input:

```
exact 7 3,5,6 1,4,7 2,3,6 1,4 2,7 4,5,7
```

Output:

```
1 4 5
nodes 6
```

Rows 1, 4 and 5 hold the columns 3 5 6, 1 4 and 2 7, which are the seven columns once each. The search takes column 1 first (the columns 1, 2, 3, 5 and 6 each have two rows and the columns 4 and 7 have three, so the fewest is two, and column 1 is the lowest of those), and its first row is row 2, which leads nowhere, and its second is row 4, which leads to the answer. It makes 6 nodes. Choosing the lowest open column every time would make 7.
