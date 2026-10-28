# How many seams tie

An **Extra Problem**: it branches off after `seam` and does not affect completing the Topic.

liblqr records one cheapest neighbour for each cell ([the Chapter](/chapters/dp-2d-liblqr) reads how) and so names one seam. Often several seams cost the same, and then the choice between them is arbitrary. Add the count.

| Command | What it does | Prints |
|---|---|---|
| `ties` | Counts the seams through the grid whose total energy is the smallest. | that count, modulo 1000000007 |

The grid and the seams are those of `seam`. Two seams are different if they use different columns in at least one row, even if they cost the same. The count can be astronomical, so it is the remainder after dividing by 1000000007, the same in every Language. The grid does not change.

## Example

Input:

```
grid 3 3 1 2 1 2 1 2 1 2 1
seam
ties
grid 2 2 4 4 4 4
ties
```

Output:

```
3
4
4
```

The first grid is `1 2 1`, `2 1 2`, `1 2 1`. The cheapest seams cost 3 and use only the 1s: from the left or the right 1 in the top row, down to the middle 1, and down to the left or the right 1 in the last row. That is 2 × 2 = 4 seams. In the second grid every seam costs 8, and a seam has 2 choices in the second row for each of its 2 starts, so all 4 tie.
