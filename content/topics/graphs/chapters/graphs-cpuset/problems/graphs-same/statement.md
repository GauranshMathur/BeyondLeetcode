# Are they in one group?

Sometimes the question is not the route but whether two nodes are connected at all, while edges keep arriving. [Linux cpusets: merging overlapping sets](/chapters/graphs-cpuset) reads the structure for it. For the next two Problems the direction of an edge does not matter: an edge joins its two nodes.

A **group** is a set of nodes that are all connected to each other by edges, followed in either direction. Every node is in exactly one group.

Add:

| Command | What it does | Prints |
|---|---|---|
| `same A B` | Asks whether `A` and `B` are in the same group. | `yes` or `no`; `no` if either name is not in the graph, even if the two names are equal |
| `groups` | Counts the groups. | the number of groups; `0` for an empty graph |

A node with no edge but one to itself is a group of its own. A node is in the same group as itself.

## Example

Input:

```
edge a b
edge c d
same a d
edge d b
same a c
same b a
same a z
groups
```

Output:

```
no
yes
yes
no
1
```

After the first two edges there are two groups, `a b` and `c d`. The edge from `d` to `b` joins them, and from then on `a` and `c` are in one group. `z` is not in the graph.
