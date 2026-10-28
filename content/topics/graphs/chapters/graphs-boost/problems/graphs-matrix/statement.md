# Print the matrix, count the cells

The other representation in [Boost.Graph: a matrix or a list](/chapters/graphs-boost) keeps one cell for every pair of nodes. You keep the lists, and add two commands that show the same graph as a matrix and count what each representation would use.

Add:

| Command | What it does | Prints |
|---|---|---|
| `matrix` | Writes the adjacency matrix. The rows and the columns are the nodes in the order they first appeared. The cell in a row and a column is `1` if there is an edge from the row's node to the column's node, and `0` if there is not. | one line per node, with its cells separated by single spaces; nothing if the graph is empty |
| `cells` | Counts the cells each representation uses. The lists use one per node and one per edge. The matrix uses one per pair of nodes, `V` × `V` for `V` nodes. | the lists' count, a space, the matrix's count |

## Example

Input:

```
edge a b
edge b c
edge c a
edge c c
matrix
cells
```

Output:

```
0 1 0
0 0 1
1 0 1
7 9
```

The nodes are `a`, `b` and `c`. Row `c` is `1 0 1`: there is an edge from `c` to `a`, none from `c` to `b`, and one from `c` to itself. The lists use 3 + 4 = 7 cells, and the matrix uses 3 × 3 = 9.
