# The edge that joins nothing new

When `uf_union` meets two nodes that already have the same root it returns without doing anything ([lib/union_find.c, lines 38 to 39 (Linux v6.12)](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/lib/union_find.c#L38-L39)); [Linux cpusets: merging overlapping sets](/chapters/graphs-cpuset) reads it. Such an edge connects nodes that were already connected, so it makes a loop in the groups. You report those edges.

An edge is **redundant** if, at the moment it is added, its two ends are already in the same group. A new edge between two nodes that are not yet in the graph is not redundant. An edge from a node to itself is. An edge that `edge` ignores because it is already there is not added, so it is not listed.

Add:

| Command | What it does | Prints |
|---|---|---|
| `redundant` | Lists the redundant edges, in the order they were added. | each as `A-B` for the edge from `A` to `B`, separated by single spaces; `none` if there are none |

`clear` forgets this list too.

## Example

Input:

```
edge a b
edge b c
edge c a
edge a b
edge d d
redundant
```

Output:

```
c-a d-d
```

`a b` and `b c` join new nodes into one group. `c a` joins two nodes that are already in it, so it is redundant. The second `a b` is ignored as a repeat. `d d` is an edge from a node to itself.
