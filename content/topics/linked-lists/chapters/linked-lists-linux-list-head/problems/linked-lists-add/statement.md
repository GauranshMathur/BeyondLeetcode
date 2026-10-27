# Add at the head or the tail

Linux's `list.h` links objects with a `list_head`, two pointers per node. This Problem builds the first four functions of that file on a small memory.

**The memory.** The Build owns a table of numbered cells, each holding a whole number. A cell nobody has written holds 0. A `list_head` at address `P` is two cells: `P` holds `next` and `P + 1` holds `prev`. A pointer is an address, and 0 plays the part of `NULL`. Addresses in the tests are between 1 and 255, and two `list_head`s in one test never share a cell.

The Build reads commands from standard input, one per line: a name, then whole numbers.

| Command | What it does | Prints |
|---|---|---|
| `init P` | `INIT_LIST_HEAD`: makes both cells of `P` hold `P`, so `P` is the head of an empty list | nothing |
| `add N H` | `list_add`: links the node `N` into the list right after the head `H` | nothing |
| `add_tail N H` | `list_add_tail`: links `N` right before `H`, which is the end of the list | nothing |
| `show H` | walks the list from `H`'s `next`, stopping when the walk is back at `H` | the addresses of the nodes in order, separated by single spaces, or `-` if there are none |
| `empty H` | `list_empty` | `yes` if `H`'s `next` is `H`, otherwise `no` |

The tests only add a node that is not on a list, to a head that has been initialised.

## Example

Input:

```
init 10
add 20 10
add 30 10
add_tail 40 10
show 10
empty 10
init 50
empty 50
show 50
```

Output:

```
30 20 40
no
yes
-
```

`add 20 10` puts 20 after the head, then `add 30 10` puts 30 after the head again, in front of 20. `add_tail 40 10` puts 40 before the head, at the end. So `show 10` prints `30 20 40`. List 50 was only initialised, so it is empty and `show` prints `-`.
