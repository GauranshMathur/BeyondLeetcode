# Keeping the most value in the budget

PyTorch's partitioner solves a 0-1 knapsack to choose which results to keep under a memory budget ([the Chapter](/chapters/dp-2d-pytorch) reads how). The Build now also holds a list of **items**, each with a **weight** and a **value**, and you add the knapsack.

| Command | What it does | Prints |
|---|---|---|
| `items w1 v1 w2 v2 ...` | Replaces the list with these items, in pairs: weight, then value. With no numbers, the list is empty. | nothing |
| `keep CAP` | Finds the largest total value of a set of items whose weights add up to at most `CAP`. | that total value |

There are at most 200 items. Every weight is between 0 and 5000, every value between 0 and 1000000, and `CAP` is between 0 and 5000. Each item may be chosen at most once. An item of weight 0 costs nothing to keep. Choosing nothing is allowed, so the answer is 0 when the list is empty or nothing fits. The list does not change. The earlier commands, on the two words and on the energy grid, still have to work.

Taking items in order of value per unit of weight does not always give the best total, and the Tests include lists where it fails.

## Example

Input:

```
items 5 10 4 7 4 7
keep 8
keep 3
items
keep 5
```

Output:

```
14
0
0
```

With `CAP` 8, the two items of weight 4 weigh 8 and are worth 7 + 7 = 14. The first item has the best value per unit of weight, but with it only 3 are left and neither of the others fits, so it totals 10. With `CAP` 3 nothing fits. An empty list is worth 0.
