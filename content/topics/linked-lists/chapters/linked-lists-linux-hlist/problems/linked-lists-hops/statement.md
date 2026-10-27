# What removing from a singly linked list costs

First the plain singly linked list. Removing a node from it means finding the node before it, and this Problem counts what that costs.

**The singly linked list.** A list is made of nodes and a head. The head is one cell that holds the address of the first node, or 0 if the list is empty. A node's first cell holds the address of the next node, or 0 if it is the last. Keep nodes at least 2 apart (a later Problem puts a second cell on each node), and use addresses between 1 and 255.

Add:

| Command | What it does | Prints |
|---|---|---|
| `spush H N` | links the node `N` in as the first node of the list with head `H` | nothing |
| `sshow H` | walks the list from the head | the addresses of the nodes in order, separated by single spaces, or `-` if there are none |
| `sdel H N` | removes `N` from the list with head `H`. It starts at the head and follows the links until it reaches the cell that points to `N`; then it writes `N`'s next address into that cell. `N`'s own cell is left as it was. | the number of nodes it stepped over before the one it found: 0 if `N` is the first node, 2 if `N` is the third. If `N` is not in the list, it prints `absent` and changes nothing |

The tests only push a node that is not on a list.

## Example

Input:

```
spush 10 20
spush 10 30
spush 10 40
sshow 10
sdel 10 20
sdel 10 99
sdel 10 40
sshow 10
```

Output:

```
40 30 20
2
absent
0
30
```

Each push goes in front, so the list is 40, 30, 20. To remove 20 the command steps over 40 and 30 before reaching the cell that points to it: 2. Node 99 is not in the list. Node 40 is now first, so 0 nodes are stepped over, and 30 is left.
