# Go deep first

A depth-first search goes the other way from the last Problem: it follows one edge as far as it will go before it tries the next. [Linux lockdep: the shortest way round a cycle](/chapters/graphs-lockdep) put the two side by side.

Add:

| Command | What it does | Prints |
|---|---|---|
| `dfs A` | Visits the nodes that can be reached from `A` (including `A`) depth first, and writes them in the order they were visited. | the names, separated by single spaces; an empty line if `A` is not in the graph |

To visit a node, write its name. Then go through the nodes it has edges to, in the order the edges were added, and for each one that has not been visited yet, visit it completely before you go on to the next. Start by visiting `A`.

## Example

Input:

```
edge a b
edge b c
edge c d
edge a d
dfs a
dfs d
```

Output:

```
a b c d
d
```

From `a` the search takes the first edge to `b`, then `c`, then `d`. Only when it comes back to `a` does it look at `a`'s second edge, to `d`, and `d` has been visited. The last Problem's `path a d` was the single edge, `a d`.
