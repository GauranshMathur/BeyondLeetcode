Walk the nodes in order. For each one, put its list in a set, then print `1` for every node in `names` that is in the set and `0` for the rest. `cells` is `V + E` and `V × V`, computed from the node count and the sum of the list lengths.

Printing the matrix is O(V²) time and output in the **worst case**, whatever the number of edges: even a graph with one edge writes `V` rows of `V` cells. Building each row's set costs O(V + E) in all, since every list is read once. That is Boost's trade: "Any edge can be accessed, added, or removed in O(1) time." ([Graph Theory Review, lines 219 to 220](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L219-L220)) and it spends V × V cells to do it. The lists spend V + E, and `has` has to walk a list.

For a graph with 1,000 nodes and 1,000 edges `cells` prints `2000 1000000`. For one with 1,000 nodes and 900,000 edges it prints `901000 1000000`.
