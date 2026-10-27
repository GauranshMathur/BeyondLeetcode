# The kernel's three-sample filter

An **Extra Problem**: it branches off after `windowmax` and does not affect completing the Topic.

Linux does not keep a queue of candidates for its windowed maximum. It keeps three samples and a few rules for them, and the answer is "almost always" the maximum of the window. This Problem asks you to replay those rules. They are written for this Problem; they follow the functions `minmax_running_max` and `minmax_subwin_update` in the Chapter's source file.

Every item is now 0 or more. Add:

| Command | What it does | Prints |
|---|---|---|
| `nichols W` | Feeds the items to the filter one by one, item `t` at time `t` (counting from 0), with window `W`. | the filter's answer after each item, separated by single spaces; an empty line if the sequence is empty |

`W` is 0 or more. The filter keeps three samples, each a pair (time, value): the **best**, the **second** and the **third**, in that order. At the start all three are (0, 0).

For each item with time `t` and value `m`, apply these steps in order:

1. If `m` is at least the best's value, or `t` minus the third's time is more than `W`: set all three samples to (`t`, `m`). The answer is `m`. Go to the next item.
2. If `m` is at least the second's value, set the second and the third to (`t`, `m`). Otherwise, if `m` is at least the third's value, set the third to (`t`, `m`).
3. Let `dt` be `t` minus the best's time.
   - If `dt` is more than `W`: set best to second, second to third and third to (`t`, `m`). Then, if `t` minus the best's time is still more than `W`, do the same move once more.
   - Otherwise, if the second's time equals the best's time and `dt` is more than `W / 4` (whole-number division, rounding down): set the second and the third to (`t`, `m`).
   - Otherwise, if the third's time equals the second's time and `dt` is more than `W / 2` (whole-number division): set the third to (`t`, `m`).
4. The answer is the best's value.

The sequence does not change.

## Example

Input:

```
load 3 9 7 4 3 1 0 8 3 5
nichols 4
```

Output:

```
3 9 9 9 9 9 4 8 8 8
```

The exact maximum of the window at each time (a sample is in the window while it is at most `W` ticks old, so the window holds up to five items) would be `3 9 9 9 9 9 7 8 8 8`. The filter differs at time 6: the 9 has aged out, and the 7 at time 2 was never kept, so the answer is the 4.
