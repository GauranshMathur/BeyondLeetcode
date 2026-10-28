# Where the lines break

TeX chooses all the breaks of a paragraph together, so that a very loose line is not left for last ([the Chapter](/chapters/dp-1d-tex) reads how). You add that choice to the Build. The rules below are written for this Problem; the Chapter says how TeX differs.

The sequence is now the **widths of the words** of a paragraph, in order: positive integers. A **layout** cuts the words into lines, in order, without reordering them. A line holds one or more consecutive words, with one space of width 1 between each two neighbours, so a line of `k` words has width equal to the widths added up, plus `k - 1`.

- No line may be wider than `W`.
- A line other than the last costs the cube of its **unused width**: `(W - its width)^3`. The last line costs 0.

Add:

| Command | What it does | Prints |
|---|---|---|
| `wrap W` | Finds the layout of the words with the smallest total cost. | that total cost; `-1` if no layout exists, which happens exactly when some word is wider than `W`; `0` if the sequence is empty |

`W` is between 1 and 1000, and the sequence has at most 2000 words, each at most 1000 wide. The sequence does not change.

## Example

Input:

```
load 4 1 2 4
wrap 6
```

Output:

```
16
```

The best layout is `4`, then `1 2`, then `4`. The first line is 4 wide, with 2 unused, so it costs 8. The second is 1 + 1 + 2 = 4 wide, with 2 unused, and costs 8. The last line is free, and the total is 16. The **greedy** layout, which puts as many words as fit on each line, starts with `4 1`, which fills the line exactly. It then has to put the `2` alone on a line with 4 unused, which costs 64.
