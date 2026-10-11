Add `pop`, and under `policy cpython` give memory back the way CPython 3.13.0 does.

| Command | What it does | Prints |
|---|---|---|
| `pop` | Removes the last item. | the removed item, or `error` if the list is empty |

Under `exact` and `double`, `pop` never changes the capacity.

Under `cpython`, after removing the item, let `n` be the new length:

- If `n` is at least half the capacity (`n >= cap >> 1`), keep the block.
- Otherwise the new capacity is 0 when `n` is 0, and `(n + (n >> 3) + 6) & ~3` when it is not. If that equals the current capacity, keep the block. If not, move to a block of that size and add `n` to the copies counter.

## Example

Input:

```
policy cpython
fill 17 1
cap
fill 4 1
cap
pop
pop
pop
pop
pop
pop
pop
pop
pop
len
cap
pop
cap
```

Output:

```
24
24
1
1
1
1
1
1
1
1
1
12
24
1
16
```

Nine pops take the length from 21 to 12, which is still half of 24, so the block is kept. The tenth leaves 11 items: below half, so the list moves to a block of `(11 + 1 + 6) & ~3 = 16`.
