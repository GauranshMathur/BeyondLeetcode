Redis's rax stores a chain of nodes that each have one child as a single node. The tree your Build keeps does not. Count how many nodes it would need if it did. The source for each claim is in [Redis rax: the edge lives in the parent](/chapters/tries-rax).

New command:

| Command | What it does | Prints |
|---|---|---|
| `rnodes` | Counts the nodes after compression, by the rule below. | the count |

`rnodes` only counts. It does not change the tree, and `nodes` still counts the plain tree.

**The rule.** Call a node *absorbed* when all three of these hold:

- it has exactly one child,
- it is not a key (no value is stored at it),
- its parent has exactly one child.

An absorbed node does not get a node of its own: it is stored inside the node above it. The root is never absorbed. `rnodes` prints the number of nodes of the plain tree minus the number of absorbed nodes.

So a chain starts at a node that may be a key, and the nodes it takes in are not keys. The rule is written for this Problem from the comments in `rax.h`; the Chapter says which.

## Example

Input:

```
add foo 1
add foobar 2
add footer 3
nodes
rnodes
add first 4
nodes
rnodes
del first
rnodes
```

Output:

```
10
6
14
10
1
6
```

With the three keys, four nodes are absorbed: `f` and `fo` (each has one child, is not a key, and its parent has one child), and `foote` and `fooba` the same way. The root is not absorbed. 10 - 4 = 6. After `add first` the tree has 14 nodes and 10 compressed ones, and after `del first` it is back to 6.
