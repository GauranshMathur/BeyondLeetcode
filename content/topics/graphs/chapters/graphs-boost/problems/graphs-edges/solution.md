Keep `names`, the nodes in the order they first appeared, and a map from each node to the list of nodes it points to. `edge` gives a new node an empty list and puts its name in `names`, then appends `B` to `A`'s list unless `B` is already there. `out` prints `A`'s list, `has` looks for `B` in it, and `count` adds up the lengths of all the lists.

`edge`, `out` and `has` walk `A`'s list, so each takes O(V) time in the **worst case**, since a list can hold every node. The look-before-append is the price of refusing repeats with a plain list. The append itself is constant time **amortised**. `count` adds one length per node: O(V) in the worst case. The space is O(V + E): one list per node and one entry per edge, which is the adjacency list's bound from the Chapter.

The Build keeps `names` for the next Problem, which needs the nodes in a fixed order.
