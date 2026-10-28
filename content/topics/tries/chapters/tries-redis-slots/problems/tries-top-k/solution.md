Collect the keys under the prefix as `list` does, each with its value, then order them by value descending and by key ascending for equal values, and print the first `K`. If there are none, or `K` is 0, print `none`.

The ordering decides ties, so the output is the same whatever order the keys were collected in. A replaced value counts at once, because the score is read from the node, and a deleted key is no longer in the tree to collect.

Cost: with m keys under the prefix, collecting costs what `list` costs, and sorting them is O(m log m) in the **worst case**, where m is all the stored keys. Keeping only the best K in a heap would give O(m log K) after the collection, but the sort is simpler and fast enough for the limits here.
