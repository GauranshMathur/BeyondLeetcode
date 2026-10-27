# Refuse to link a broken list

Linux can check a node's neighbours before it links or unlinks, and skip the operation if they do not agree. Add those checks to the commands from Problems 1 and 2.

The commands `add`, `add_tail`, `del` and `del_init` now test their neighbours first. On the first test that fails they print one line and do not link or unlink anything. The tests, in order:

**`add` and `add_tail`.** Call the node being added `N`, and the two nodes it would go between `prev` and `next` (for `add N H`: `H` and `H`'s next; for `add_tail N H`: `H`'s prev and `H`).

| Test | Prints |
|---|---|
| `prev` is 0 | `corrupt add: prev-null` |
| `next` is 0 | `corrupt add: next-null` |
| `next`'s prev cell is not `prev` | `corrupt add: next.prev` |
| `prev`'s next cell is not `next` | `corrupt add: prev.next` |
| `N` is `prev` or `N` is `next` | `corrupt add: double-add` |

**`del N` and `del_init N`.** Call `N`'s prev cell `prev` and its next cell `next`.

| Test | Prints |
|---|---|
| `next` is 0 | `corrupt del: next-null` |
| `prev` is 0 | `corrupt del: prev-null` |
| `next` is 256 | `corrupt del: poison1` |
| `prev` is 290 | `corrupt del: poison2` |
| `prev`'s next cell is not `N` | `corrupt del: prev.next` |
| `next`'s prev cell is not `N` | `corrupt del: next.prev` |

Two things do **not** change, as in Linux. `del N` still writes 256 and 290 into `N`'s cells after a failed test, and `del_init N` still makes `N` an empty list head. When all tests pass, the commands behave as before. The tests use `set` to make corruption.

## Example

Input:

```
init 10
add 30 10
add 30 10
add_tail 50 10
show 10
del 30
del 30
show 10
get 30
get 31
del 70
```

Output:

```
corrupt add: double-add
30 50
corrupt del: poison1
50
256
290
corrupt del: next-null
```

The second `add 30 10` would link 30 between 10 and 30, so `N` is `next`: `double-add`, and nothing changes. The first `del 30` passes and poisons 30. The second finds 256 in its next cell: `poison1`. Cells 30 and 31 hold 256 and 290. Node 70 was never written, so its next cell is 0: `next-null`.
