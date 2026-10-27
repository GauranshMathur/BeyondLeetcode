# Middle of a path

Emacs walks lists that might be circular with two pointers at different speeds. From now on, the numbers you `load` can also be a **table of links**: item `i` is the number of the node that follows node `i`, or `-1` if no node follows it. Nodes are numbered from 0.

Add:

| Command | What it does | Prints |
|---|---|---|
| `middle S` | Starts at node `S` and follows the links until one is `-1`. That is a **path** of n nodes. Prints the node at position `floor(n / 2)` of the path, counting the start as position 0. | the node number |

In the Tests every path from a start node ends; none loops.

## Example

Input:

```
load 1 2 3 4 -1
middle 0
middle 2
middle 4
```

Output:

```
2
3
4
```

From node 0 the path is 0, 1, 2, 3, 4: five nodes, so position 2, which is node 2. From node 2 the path is 2, 3, 4: position 1, node 3. From node 4 the path is just node 4. With an even number of nodes the later of the two middle nodes is the answer: in the table `3 -1 0 1`, the path from node 2 is 2, 0, 3, 1, and the answer is node 3.
