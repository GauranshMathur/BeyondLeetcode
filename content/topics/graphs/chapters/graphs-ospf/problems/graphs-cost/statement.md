# Add weights, find the cheapest route

[OSPF: every router runs Dijkstra](/chapters/graphs-ospf) gives every link a cost and looks for the cheapest route. You give every edge a weight, and add the search.

`edge` takes a third, optional word now: `edge A B W`, where `W` is a whole number from 1 to 1,000,000 and the weight of the edge. Without it the weight is 1. If there is already an edge from `A` to `B`, `edge` keeps the smaller of the two weights and changes nothing else, including where `B` sits in `A`'s list. (Before this Problem every weight was 1, so a repeat changed nothing.)

Add:

| Command | What it does | Prints |
|---|---|---|
| `cost A B` | Finds the lowest total weight of a route from `A` to `B` that follows the edges in their direction. | the total; `0` if `A` and `B` are the same node in the graph; `none` if there is no route or either name is not in the graph |

## Example

Input:

```
edge a b 7
edge a c 2
edge c b 3
edge b d
cost a b
cost a d
cost d a
cost a a
```

Output:

```
5
6
none
0
```

The edge from `a` to `b` weighs 7, but the route through `c` weighs 2 + 3 = 5. Reaching `d` adds the edge `b d`, which has the default weight 1, for 6. Nothing leads from `d` to `a`.
