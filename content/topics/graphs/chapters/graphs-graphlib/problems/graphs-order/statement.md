# Order the tasks

[Python graphlib: tasks that are ready](/chapters/graphs-graphlib) reads how a build decides what to run first. In the Build, an edge from `A` to `B` now means that `A` must come before `B`, and you print an order that respects every edge.

Add:

| Command | What it does | Prints |
|---|---|---|
| `order` | Writes every node of the graph in an order where, for each edge, the edge's start comes before its end. | the names separated by single spaces, or `cycle` if no such order exists; an empty line if the graph is empty |

There are usually many such orders. Print this one: build the order one node at a time. Among the nodes that have not been written yet and have no edge coming from a node that has not been written, write the one with the smallest name. Compare names as plain strings, one character at a time, by the character's code, so `a-1` comes before `a.1`, which comes before `a1`, and `x10` before `x2`. Repeat until every node is written. If there is a moment when some nodes are left but none can be written, no order exists: print `cycle`.

An edge from a node to itself can never be satisfied, so it makes a `cycle`.

## Example

Input:

```
edge core util
edge core net
edge net app
edge util app
order
edge app core
order
```

Output:

```
core net util app
cycle
```

`core` has no edge into it, so it goes first. Then `net` and `util` are both free, and `net` has the smaller name. `app` waits for both. After `edge app core` the four nodes wait for each other in a ring, and none can go first.
