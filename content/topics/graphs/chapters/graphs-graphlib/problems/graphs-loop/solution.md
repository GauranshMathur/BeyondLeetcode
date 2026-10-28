Try the nodes in sorted order. For one node, search breadth first from it and watch the edges: the first edge that leads back to the start closes the shortest cycle through the node. Read the route back through the map of where each node was reached from, put the start first, and add the start again at the end. If no node has a way back, print `none`.

One search is O(V + E) in the **worst case**, and the program may run one for every node, so `loop` is O(V × (V + E)) in the **worst case**. A single depth-first search can find some cycle faster, but this Problem asks for a particular one, so it uses the search that finds the shortest.

`tsort` prints a loop too, but it does not promise this one: its comment says only "print the loop on standard error, remove a relation to break the loop" ([src/tsort.c, lines 302 to 304](https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36/src/tsort.c#L302-L304)).
