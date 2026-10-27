# Unlink, and poison

Removing a node from a ring needs only the node, because it holds both neighbours. `list_del` then overwrites the dead node's pointers with two constants that fault if anyone follows them.

Add:

| Command | What it does | Prints |
|---|---|---|
| `del P` | `list_del`: makes `P`'s two neighbours point at each other, then writes 256 into `P`'s `next` cell and 290 into its `prev` cell (`LIST_POISON1` and `LIST_POISON2`) | nothing |
| `del_init P` | `list_del_init`: unlinks `P` the same way, then makes `P` an empty list head, as `init P` does | nothing |
| `show_rev H` | like `show`, but follows `prev` cells from `H`'s `prev` until the walk is back at `H` | the addresses in reverse order, or `-` if there are none |
| `get A` | reads cell `A` | the number in it |

The tests only delete a node that is on a list, and never use 256 or 290 as an address.

## Example

Input:

```
init 10
add_tail 20 10
add_tail 30 10
add_tail 40 10
del 30
show 10
show_rev 10
get 30
get 31
del_init 20
show 10
get 20
get 21
empty 20
```

Output:

```
20 40
40 20
256
290
40
20
20
yes
```

After `del 30` the list is 20, 40. Cells 30 and 31, the `next` and `prev` of the deleted node, hold the two poison numbers. `del_init 20` removes 20 as well, leaving 40, and turns 20 into an empty list of its own: both its cells hold 20 and `empty 20` says `yes`.
