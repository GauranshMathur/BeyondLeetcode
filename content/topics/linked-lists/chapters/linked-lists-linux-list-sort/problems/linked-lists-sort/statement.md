# Sort a list by merging

Sort a whole singly linked list with the merge from Problem 8.

Add:

| Command | What it does | Prints |
|---|---|---|
| `ssort H` | sorts the list with head `H` by key, smallest first. Equal keys keep the order they had. Only links change | nothing |

`svalues` and `sshow` show the result.

## Example

Input:

```
spush 10 108
spush 10 106
spush 10 104
spush 10 102
spush 10 100
set 101 3
set 103 1
set 105 3
set 107 2
set 109 1
ssort 10
svalues 10
sshow 10
```

Output:

```
1 1 2 3 3
102 108 106 100 104
```

The list is 100, 102, 104, 106, 108 with keys 3, 1, 3, 2, 1. Sorted, the keys are 1, 1, 2, 3, 3. Of the two nodes with key 1, node 102 was before node 108, so it still is; the same holds for 100 and 104, which both have key 3.
