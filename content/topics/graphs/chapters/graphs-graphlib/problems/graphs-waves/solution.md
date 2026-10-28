Use the same counts as `order`, but work in rounds. The first wave is every node whose count is 0, sorted. Print it, then for every node in the wave take 1 off the count of each node it has an edge to; the nodes that reach 0 are the next wave. When a round finds no nodes, stop. If fewer nodes were written than the graph has, print `cycle`.

Each edge is counted down once, so the counting is O(V + E), and sorting every wave costs O(V log V) in all in the **worst case**, because each node is sorted once. The total is O(V + E + V log V), with O(V + E) space.

A wave is a set of nodes that all had every dependency done once the waves before it were done. The number of waves is the length, in nodes, of the longest chain of edges in the graph, which is how many steps a build needs if it can run every ready task at the same time. That sentence is an argument from the definition, not a claim about any tool.
