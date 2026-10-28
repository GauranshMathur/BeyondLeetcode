# OSPF: every router runs Dijkstra

Give every edge a cost and the question changes: not the route with the fewest edges but the one with the lowest total cost. This Chapter reads how a real routing protocol answers it. OSPF, the Open Shortest Path First protocol, is defined in [RFC 2328](https://www.rfc-editor.org/rfc/rfc2328.html), and the code here is from FRRouting 10.0, a routing suite whose `ospfd/ospf_spf.c` marks its steps with the RFC's numbers ([lines 1750 to 1754](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1750-L1754)).

## Every router solves the same graph

In OSPF every router has a database of the links, and the RFC says what each one does with it: "All routers run the exact same algorithm, in parallel. From the link-state database, each router constructs a tree of shortest paths with itself as root." ([RFC 2328, section 1](https://www.rfc-editor.org/rfc/rfc2328.html#section-1)) The map is a graph: "The area's link state database is represented as a directed graph." And a path costs the sum of its links: "The link state cost of a path is calculated as the sum of the costs of the path's constituent links (as advertised in router-LSAs and network-LSAs)." Shorter means cheaper: "One path is said to be "shorter" than another if it has a smaller link state cost." ([RFC 2328, section 16.1](https://www.rfc-editor.org/rfc/rfc2328.html#section-16))

## The candidate list

The RFC describes the algorithm (the page names it: Dijkstra) in terms of a list: "the paths to the candidate vertex that is closest to the root are guaranteed to be shortest; this vertex is added to the shortest-path tree, removed from the candidate list, and its adjacent vertices are examined for possible addition to/modification of the candidate list." And it stops: "It terminates when the candidate list becomes empty." ([RFC 2328, section 16.1](https://www.rfc-editor.org/rfc/rfc2328.html#section-16)) The nodes whose cheapest path is known so far are the tree. The candidates are nodes some path has reached, with the cost of the best path found yet. Each step takes the cheapest candidate, and its cost is final. Then it looks at that node's edges, and each edge may give a candidate a cheaper path. The guarantee in the RFC's sentence needs every cost to be 0 or more, and the Build uses whole numbers of 1 or more: an argument of this Chapter, not a sentence of the RFC.

The part of the algorithm that decides the speed is how the list finds its cheapest member, which is a priority queue ([Heaps](/chapters/heaps-heapq)). In FRRouting's `ospfd/ospf_spf.c` the main loop examines the new tree node's links, takes the next candidate from the queue, and stops when the queue is empty:

```c
/* RFC2328 16.1. (2). */
ospf_spf_next(v, area, &candidate);

/* RFC2328 16.1. (3). */
v = vertex_pqueue_pop(&candidate);
if (!v)
	/* No more vertices left. */
	break;
```

([ospfd/ospf_spf.c, lines 1750 to 1757 (FRRouting frr-10.0)](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1750-L1757)) The queue is made with the comment "Create a new heap for the candidates." ([line 1729](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1729)) and the comment above its comparison function says "Heap related functions, for the managment of the candidates, to be used with pqueue." (spelled so in the source; [lines 63 to 64](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L63-L64)). But the line that declares the queue is `DECLARE_SKIPLIST_NONUNIQ(vertex_pqueue, struct vertex, pqi, vertex_cmp);` ([line 81](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L81)), and the header that defines that macro introduces its family as "skiplist, sorted." ([lib/typesafe.h, line 970](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/lib/typesafe.h#L970)). The comments say heap, the code is a skip list. The Chapter's point is that the algorithm asks only for a sorted container with add, remove and pop of the smallest, and any structure that gives those will do.

## A cheaper route to a node already waiting

What if a path to a candidate that is already waiting turns out cheaper? The doc comment above the function that examines a node's links says: "Update the list of candidates with any vertices not already on the list. If a lower-cost path is found to a vertex already on the candidate list, store the new cost." ([lines 1304 to 1306](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1304-L1306)) Here is how the code stores it (the comments are cut to their first line, and `...` stands for the call's arguments):

```c
if (w->distance < distance) {
	continue;
}
else if (w->distance == distance) {
	/* Found an equal-cost path to W. */
	ospf_nexthop_calculation(...);
}
else {
	/* Found a lower-cost path to W. */
	vertex_pqueue_del(candidate, w);
	ospf_nexthop_calculation(...);
	vertex_pqueue_add(candidate, w);
}
```

([lines 1496 to 1519](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1496-L1519)) A worse path is dropped, a cheaper one makes the code remove the node from the queue and add it back with its new cost. The Reference Code in the Problems chooses differently. It never removes an entry, so the heap does not need a way to find one in its middle: it pushes a second entry for the node with the new cost, and when an old entry comes out it checks it against the best cost known and skips it if it is stale. Each edge pushes at most one entry, so there are at most E + 1 entries, and each is pushed and popped once at O(log E) = O(log V). Dijkstra's algorithm is O((V + E) log V) in the **worst case** that way. (This count is the Chapter's reading of the loop, not a claim by FRRouting.)

## Equal-cost paths

The middle branch above is a tie: "Found an equal-cost path to W." ([line 1501](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1501)) The RFC says what OSPF does with ties: "if multiple equal-cost routes to a destination exist, they are all discovered and used." ([RFC 2328, section 2](https://www.rfc-editor.org/rfc/rfc2328.html#section-2)) and "The OSPF protocol maintains multiple equal-cost routes to all destinations." ([section 16.8](https://www.rfc-editor.org/rfc/rfc2328.html#section-16)) The Problems above print one cost, which does not change with ties. The Extra Problem `ways` counts the tied cheapest paths.

## What the Problems build

`edge A B W` takes an optional weight: a whole number of 1 or more, and 1 if left out. A repeated edge keeps the lower of its two weights. `cost A B` is the lowest total weight from A to B. `farthest A` runs the same search from A and prints the largest of the lowest costs to every node, the cost of the router that is hardest to reach. `ways A B` counts how many different paths reach B at that lowest cost.
