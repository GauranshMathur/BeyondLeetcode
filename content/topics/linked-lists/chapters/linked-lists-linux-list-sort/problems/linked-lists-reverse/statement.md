# Reverse the links in place

Back to the singly linked list of Problem 4. Reverse it by changing the links, not by moving values.

Add:

| Command | What it does | Prints |
|---|---|---|
| `sreverse H` | reverses the list with head `H`: the first node becomes the last and the last becomes the first. Only the head's cell and the nodes' first (next) cells may change | nothing |

An empty list or a list of one node stays as it is. `sshow` and `sdel` from before still work on the result.

## Example

Input:

```
spush 10 20
spush 10 30
spush 10 40
spush 10 50
sshow 10
sreverse 10
sshow 10
sreverse 10
sshow 10
sreverse 12
sshow 12
```

Output:

```
50 40 30 20
20 30 40 50
50 40 30 20
-
```

Reversing twice gives the original order back. Cell 12 was never pushed to, so its list is empty and reversing it changes nothing.
