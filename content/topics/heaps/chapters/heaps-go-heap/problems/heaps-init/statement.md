Build a heap from a whole array in one pass, instead of one push at a time.

| Command | What it does | Prints |
|---|---|---|
| `init K1 K2 ... Kn` | Throws away every item and makes new ones from the keys, in the order given. `n` can be 0, which empties the heap. | nothing |

The new items take the next `n` tickets in order: the ticket counter keeps counting from where it was and does not restart. Put the items into the array as given, so that index `i` holds `Ki`. Then, for each index `i` from `n / 2 - 1` (whole-number division) down to 0, move the item at `i` down the way `pop` does, with a hole that starts at `i`. The hole moves smaller children up until it is at a leaf, the item goes in, and then it moves up, but never higher than index `i`, where the hole started. Comparisons are counted as before, so `cmp` includes them.

For `n` of 0 or 1 there is nothing to do.

## Example

Input:

```
init 9 4 7 1 8 2
show
cmp
```

Output:

```
1 4 2 9 8 7
6
```

`show` prints `1 4 2 9 8 7` and `cmp` prints 6. The 7 and the 4 each moved down one row and the 9 moved down two.
