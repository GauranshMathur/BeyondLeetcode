# The Nth node from the end

A classic puzzle on the singly linked list from Problem 4: remove a node counted from the *end*, when you only know how to walk from the front. Add:

| Command | What it does | Prints |
|---|---|---|
| `snth H K` | removes the `K`-th node from the end of the list with head `H` (`K` is 1 for the last node, 2 for the one before it, and so on) | the address of the node removed. If the list has fewer than `K` nodes it prints `none` and changes nothing |

`K` is at least 1. The point of the puzzle is to do it in one walk from the front, without first counting the nodes.

## Example

Input:

```
spush 10 20
spush 10 30
spush 10 40
spush 10 50
spush 10 60
sshow 10
snth 10 2
sshow 10
snth 10 9
snth 10 1
sshow 10
```

Output:

```
60 50 40 30 20
30
60 50 40 20
none
20
60 50 40
```

The list is 60, 50, 40, 30, 20. The second node from the end is 30, which is removed. There are only four nodes left, so the 9th from the end does not exist. The last node, 20, is removed.
