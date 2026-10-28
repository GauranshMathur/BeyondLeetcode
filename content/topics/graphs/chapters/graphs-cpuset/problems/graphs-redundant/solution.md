Make `union` return whether it joined two groups. When `edge` adds a new edge and `union` reports that the two roots were already the same, append `A-B` to a list. `redundant` prints the list, or `none` if it is empty, and `clear` empties it. An edge that is already in the graph returns before it reaches `union`, so it is never listed.

Nothing is added to the cost of `edge`: O(V) in the **worst case** for the look-before-append from the first Problem, plus the **amortised** O(α(V)) for `union`. `redundant` takes time proportional to the length of the list.

In a graph where edges are read as undirected, an edge is redundant exactly when it closes a cycle with the edges before it. This is the idea behind finding the one extra edge that stops a tree from being a tree.
