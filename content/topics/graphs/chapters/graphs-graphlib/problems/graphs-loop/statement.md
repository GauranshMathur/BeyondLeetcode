# Print a loop

When `tsort` meets a loop it prints the loop: its comment says "print the loop on standard error, remove a relation to break the loop" ([src/tsort.c, lines 302 to 304 (coreutils v9.5)](https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36/src/tsort.c#L302-L304)). [Python graphlib: tasks that are ready](/chapters/graphs-graphlib) reads it. This Extra Problem branches off `order`, and nothing you add here is carried into the Problems after it.

Add:

| Command | What it does | Prints |
|---|---|---|
| `loop` | Finds one cycle in the graph. | the cycle as names separated by single spaces, the first name repeated at the end; `none` if the graph has no cycle |

A node **lies on a cycle** if you can leave it, follow edges for one or more steps, and come back to it. An edge from a node to itself is a cycle of one step. `loop` picks the node with the smallest name (compared as in `order`) that lies on a cycle, and prints the shortest cycle through it. If there are several equally short, search the way `path` does: breadth first from that node, taking each node's edges in the order they were added and remembering which node each node was first reached from. The first edge you meet that leads back to the start ends the search. The cycle is the route from the start to the node that held that edge, followed by the start again.

## Example

Input:

```
edge x y
edge b c
edge c a
edge a b
edge c d
loop
```

Output:

```
a b c a
```

`a`, `b` and `c` are on a cycle, and `a` has the smallest name of the three. `x`, `y` and `d` are on none.
