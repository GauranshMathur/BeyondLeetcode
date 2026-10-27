# Merge two sorted lists, stably

The merge in Linux's `list_sort` works on singly linked lists and relinks the nodes it is given. Build it for the lists of Problem 4.

**Keys.** From now on a node of a singly linked list is two cells: `next` at its address, and a number, its **key**, at its address plus one. The tests set keys with `set`. Keep nodes at least 2 apart.

Add:

| Command | What it does | Prints |
|---|---|---|
| `smerge A B` | merges the lists with heads `A` and `B`, each sorted by key from smallest to largest, into the list with head `A`, sorted the same way. When two nodes have equal keys, the one from `A` goes first. Only links change. Afterwards the list with head `B` is empty | nothing |
| `svalues H` | reads the keys of the list in order | the keys separated by single spaces, or `-` if the list is empty |

## Example

Input:

```
spush 10 104
spush 10 102
spush 10 100
spush 20 112
spush 20 110
set 101 1
set 103 4
set 105 9
set 111 4
set 113 5
smerge 10 20
sshow 10
svalues 10
sshow 20
svalues 20
```

Output:

```
100 102 110 112 104
1 4 4 5 9
-
-
```

List 10 holds the nodes 100, 102, 104 with keys 1, 4, 9 and list 20 holds 110, 112 with keys 4, 5. The merged list in 10 has keys 1, 4, 4, 5, 9. The two nodes with key 4 are 102, from list 10, and 110, from list 20: 102 comes first. List 20 is left empty.
