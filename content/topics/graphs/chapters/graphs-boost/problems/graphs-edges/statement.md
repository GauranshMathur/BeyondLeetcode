# Keep the edges in lists

[Boost.Graph: a matrix or a list](/chapters/graphs-boost) reads the list representation: each node keeps the nodes it points to. You start the Build that holds this Topic's graph, and you begin with that representation.

The Build reads commands from standard input, one per line. Blank lines are ignored, and so is a line that starts with a word that is not a command. The Build holds one **directed graph**, empty at the start. A **node** has a name: a word of lowercase letters, digits, `-` and `.`. A node is in the graph once its name has appeared in an `edge` command, and the graph remembers the order in which nodes first appeared. Commands that print, print one line.

| Command | What it does | Prints |
|---|---|---|
| `clear` | Forgets every node and every edge. | nothing |
| `edge A B` | Adds an edge from `A` to `B`. A node that is not in the graph yet joins it, `A` before `B`. `A` and `B` may be the same name. If there is already an edge from `A` to `B`, nothing changes. | nothing |
| `out A` | Lists the nodes that `A` has an edge to, in the order the edges were added. | the names, separated by single spaces; an empty line if `A` has no edges or is not in the graph |
| `has A B` | Asks whether there is an edge from `A` to `B`. | `yes` or `no` |
| `count` | Counts the nodes and the edges. | the number of nodes, a space, the number of edges |

An edge from `A` to `B` is not an edge from `B` to `A`: they are two edges.

## Example

Input:

```
edge app libc
edge app zlib
edge libc zlib
edge app libc
out app
has libc app
count
```

Output:

```
libc zlib
no
3 3
```

The second `edge app libc` changes nothing. The graph has three nodes, `app`, `libc` and `zlib`, and three edges.
