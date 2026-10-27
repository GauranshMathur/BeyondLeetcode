# Walk the list and check every back-pointer

The checks in Problem 9 look at one operation's neighbours. This one looks at a whole list: walk it and compare each forward link with the link that should point back.

Add:

| Command | What it does | Prints |
|---|---|---|
| `check H` | walks the list with head `H` as follows, and changes nothing. Let `cur` be `H` and `count` be 0. Repeat: let `nxt` be `cur`'s next cell. If `nxt` is 0, or `nxt`'s prev cell is not `cur`, stop. If `nxt` is `H`, stop. Otherwise add 1 to `count` and let `cur` be `nxt` | `broken C` if it stopped at the first test, where `C` is the value of `cur`; `ok N` if it stopped at `H`, where `N` is `count`, the number of nodes in the list |

`N` is the number of nodes other than the head. `check` always stops, whatever the memory holds.

## Example

Input:

```
init 10
check 10
add_tail 30 10
add_tail 50 10
check 10
set 31 70
check 10
set 31 10
set 50 0
check 10
set 50 30
check 10
```

Output:

```
ok 0
ok 2
broken 10
broken 50
broken 50
```

An empty list is `ok 0`. After adding 30 and 50 the ring is 10, 30, 50 and `ok 2`. `set 31 70` overwrites the prev cell of 30: stepping from 10 to 30 finds 70 where 10 should be, so `broken 10`. After repairing that, `set 50 0` ends the list at 50 with a 0: `broken 50`. `set 50 30` points 50 back at 30, a loop that avoids the head, but 30's prev cell is 10, not 50, so `broken 50` again.
