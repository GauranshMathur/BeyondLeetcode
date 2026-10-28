# The route with the fewest edges

[Linux lockdep: the shortest way round a cycle](/chapters/graphs-lockdep) reads a breadth-first search that prints the shortest route. You add the search to the Build.

Add:

| Command | What it does | Prints |
|---|---|---|
| `path A B` | Finds a route from `A` to `B` that follows the edges in their direction and uses as few edges as possible. | the nodes of the route from `A` to `B`, separated by single spaces; `none` if there is no route or either name is not in the graph |

A route from a node to itself uses no edges: if `A` and `B` are the same node and it is in the graph, the route is that one node.

Several routes can be equally short. To make the answer one route, search the way a breadth-first search does. Start with a queue that holds `A`, and note that `A` has been reached. Take a node from the front of the queue and go through the nodes it has edges to, in the order the edges were added. Each one that has not been reached yet is noted as reached from the node you took, and goes to the back of the queue. Stop when `B` has been reached. The route is `B`, then the node `B` was reached from, and so on back to `A`, written from `A` to `B`.

## Example

Input:

```
edge a b
edge b c
edge c d
edge a d
path a d
path a c
path d a
path c c
```

Output:

```
a d
a b c
none
c
```

`a d` is one edge, shorter than `a b c d`. Nothing leads from `d` back to `a`, because the edges only go one way.
