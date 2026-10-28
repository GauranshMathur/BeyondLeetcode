Run the search of `cost` from `A` and keep every total it finds, not only one. If it reached fewer nodes than the graph has, some node cannot be reached and the answer is `none`. Otherwise the answer is the largest total; the total for `A` itself is 0, which is the answer when `A` is the only node. A name that is not in the graph is `none`.

It is one search: O((V + E) log V) in the **worst case**, as in the last Problem, plus O(V) to take the largest. Running `cost` from `A` to each node in turn would repeat the search V times.
