**`container_of`.** `entry P O` prints `P - O`. In C the compiler does the same subtraction with `offsetof`; here the offset is given.

**Walking.** `values H O` is the walk of `show H`, and at each node `p` it reads the cell at `p - O`, the first cell of the object, which holds its value. The walk itself never looks at the value: the list code stays generic, and the caller supplies the offset that says which member the list is made of.

**Several lists.** The object in the example has two members, so it is linked into two rings through different cells. `list_add_tail` into one ring writes only that member's cells.

**Cost.** `entry` is O(1). `values` is O(n) for a list of n nodes.
