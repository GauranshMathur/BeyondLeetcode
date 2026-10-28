# The hardest node to reach

One search from a node gives the lowest cost to every other node, and [OSPF: every router runs Dijkstra](/chapters/graphs-ospf) reads a protocol that builds a tree of them: "each router constructs a tree of shortest paths with itself as root" ([RFC 2328, section 1](https://www.rfc-editor.org/rfc/rfc2328.html#section-1)). You use all of the costs at once.

Add:

| Command | What it does | Prints |
|---|---|---|
| `farthest A` | Finds, for every node in the graph, the lowest total weight of a route from `A` to it, and takes the largest of these. | that largest total; `0` if `A` is the only node; `none` if some node cannot be reached from `A`, or if `A` is not in the graph |

## Example

Input:

```
edge hub a 4
edge hub b 1
edge b c 2
farthest hub
farthest a
```

Output:

```
4
none
```

From `hub` the cheapest routes cost 4 to `a`, 1 to `b` and 3 to `c` (through `b`). The largest is 4. From `a`, nothing can be reached, not even `hub`, so the answer is `none`.
