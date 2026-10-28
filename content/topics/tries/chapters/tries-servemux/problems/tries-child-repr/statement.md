Go's `ServeMux` keeps the children of a node in a slice while there are at most 8 of them, and in a map after that. Report how many nodes of your tree would use each. The source for each claim is in [Go ServeMux: a tree of path segments](/chapters/tries-servemux).

New command:

| Command | What it does | Prints |
|---|---|---|
| `shape` | Counts the nodes of the tree by how they would store their children. | two numbers: the nodes that use a slice, a space, and the nodes that use a map |

**The rule.** A node uses a **map** if it has ever had more than 8 children at the same time since it was created. The first time a new child would be the ninth, the node becomes a map, and it stays a map for as long as the node exists, even if children are removed later. Any other node that has at least 1 child uses a **slice**. A node that has no children and never became a map counts in neither number.

Go's own `mapping` has no way to remove a pair, so the rule for `del` is written for this Problem: a node that `del` cuts from the tree is gone, and if the same prefix is added again later, its node is new and starts as a slice. A node that stays in the tree keeps being a map.

Replacing the value of a stored key with `add` does not add a child. Root counts like any other node.

## Example

Input:

```
add a 1
add b 2
add c 3
add d 4
add e 5
add f 6
add g 7
add h 8
shape
add i 9
shape
add ab 1
shape
```

Output:

```
1 0
0 1
1 1
```

Eight children fit in a slice, so the root is the one slice. `add i` gives the root a ninth child and it becomes a map; `a`, `b` and the others have no children. After `add ab 1`, node `a` has one child: one slice and one map.
