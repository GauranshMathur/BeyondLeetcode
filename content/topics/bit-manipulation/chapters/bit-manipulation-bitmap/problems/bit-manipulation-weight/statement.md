# Count the flags that are on

The kernel's `bitmap_weight` counts the bits that are set among the first `nbits` of a bitmap. Add the same count to the Build.

| Command | What it does | Prints |
|---|---|---|
| `count N` | Counts the flags that are on among flags 0 up to `N - 1`. Flags past the end of the sequence are off. | the count |

`N` is from 0 to 100,000,000. `count 0` is `0`. `N` need not be a multiple of 32, and it may be past the end of the sequence.

## Example

Input:

```
load 255 4294967295
count 8
count 40
count 100
```

Output:

```
8
16
40
```

The first word has 8 bits on and the second has all 32. `count 8` sees only the 8 of the first word. `count 40` sees all of the first word and the lowest 8 bits of the second. `count 100` is past the end, so it counts every bit there is.
