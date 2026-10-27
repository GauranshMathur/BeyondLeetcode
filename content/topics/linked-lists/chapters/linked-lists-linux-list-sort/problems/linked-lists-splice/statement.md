# Join two lists without walking them

Linux joins two rings by tying the first and last nodes of one to the neighbours in the other. Build `list_splice` and `list_splice_tail` on the ring from Problems 1 and 2.

Add:

| Command | What it does | Prints |
|---|---|---|
| `splice L H` | `list_splice_init`: if the list with head `L` is not empty, moves all its nodes, in their order, to just after the head `H`. Then `L` is made an empty list head | nothing |
| `splice_tail L H` | `list_splice_tail_init`: the same, but the nodes go just before `H`, at the end of its list | nothing |

If `L` is empty, nothing changes. `L` and `H` are heads of different lists. `show`, `show_rev`, `empty` and `get` still work, and the tests use them to look at both lists.

## Example

Input:

```
init 10
init 20
add_tail 30 10
add_tail 40 10
add_tail 50 20
add_tail 60 20
splice 20 10
show 10
empty 20
splice_tail 20 10
show 10
show_rev 10
```

Output:

```
50 60 30 40
yes
50 60 30 40
40 30 60 50
```

List 10 is 30, 40 and list 20 is 50, 60. `splice 20 10` puts 50, 60 right after the head 10, in front of 30, 40, and empties list 20. The next `splice_tail` finds list 20 empty and changes nothing. Both directions of the ring are intact, as `show_rev` shows.
