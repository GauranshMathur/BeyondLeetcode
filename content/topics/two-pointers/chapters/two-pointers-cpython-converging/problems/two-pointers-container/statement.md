# Widest container

An **Extra Problem**: it branches off after `pairsum` and does not affect completing the Topic.

Think of the sequence as the heights of upright bars, one unit apart, with heights 0 or more. Choose two bars as walls. Water can fill between them up to the height of the shorter wall, and the width is the distance between the walls.

Add:

| Command | What it does | Prints |
|---|---|---|
| `water` | Over all pairs of positions `i < j`, finds the largest value of `(j - i) * min(height[i], height[j])`. The sequence need not be sorted. | that value; 0 if the sequence has fewer than two items |

## Example

Input:

```
load 4 9 3 7 2 8 5
water
```

Output:

```
32
```

The walls at positions 2 and 6 (heights 9 and 8, counted from 1) are 4 apart, so they hold 4 * min(9, 8) = 32. The two end bars, 6 apart, hold only 6 * min(4, 5) = 24.
