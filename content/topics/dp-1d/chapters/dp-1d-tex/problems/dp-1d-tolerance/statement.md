# Lines too loose are not allowed

An **Extra Problem**: it branches off after `wrap` and does not affect completing the Topic.

TeX does not only price a line that is too loose. It refuses it: its source calls a break **feasible** "in the sense that there is a way to end a line at the given place without requiring any line to stretch more than a given tolerance" ([texk/web2c/tex.web, lines 16074 to 16076](https://github.com/TeX-Live/texlive-source/blob/f68b0992e13a2e155d71beb3e016ea4139023224/texk/web2c/tex.web#L16074-L16076)). Add the same rule to your layout. The layouts, the line widths and the costs are exactly those of `wrap`, with one more rule: **a line other than the last may leave at most `T` unused.** The last line may leave any amount unused, as long as it fits.

Add:

| Command | What it does | Prints |
|---|---|---|
| `tolerant W T` | Finds the cheapest layout in which every line other than the last leaves at most `T` unused. | that cost; `-1` if no layout obeys the rules; `0` if the sequence is empty |

`W` is between 1 and 1000, and `T` is between 0 and 1000. With `T` at least `W`, the answer is the one `wrap W` prints. The sequence does not change.

## Example

Input:

```
load 4 1 2 4
wrap 6
tolerant 6 2
tolerant 6 1
```

Output:

```
16
16
-1
```

The cheapest layout, `4`, `1 2`, `4`, leaves 2 unused on each of its first two lines, so it is allowed when `T` is 2. With `T` of 1, the first line must be `4 1`, which leaves 0 unused. Then `2` stands alone with 4 unused, which is over the tolerance, and `2 4` is 7 wide, which does not fit in 6. So no layout is allowed.
