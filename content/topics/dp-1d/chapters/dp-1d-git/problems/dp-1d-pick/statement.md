# Picking without neighbours

git's `levenshtein` keeps only the rows its recurrence reads ([the Chapter](/chapters/dp-1d-git) reads how). Here a recurrence reads only the previous two answers, and you keep two numbers.

The sequence is now a list of **values**: integers that may be negative or zero. You may **pick** some of the items, with one rule: no two picked items may be neighbours, that is, next to each other in the sequence. Picking nothing is allowed.

Add:

| Command | What it does | Prints |
|---|---|---|
| `pick` | Finds the picks with the largest total value. | that total; `0` if the sequence is empty or no pick beats picking nothing |

The sequence has at most 2000 items, each between -1000000 and 1000000. The sequence does not change. The Tests cannot see how much memory your program keeps, but the Solution does the job with two variables, and it is worth doing the same.

## Example

Input:

```
load 4 1 1 5
show
pick
load -3 -1 -2
pick
```

Output:

```
4 1 1 5
9
0
```

In `4 1 1 5` the best picks are the first and the last item: 4 + 5 = 9. Taking the two 1s in the middle is not allowed together, and 4 + 1 is only 5. In `-3 -1 -2` every item is negative, so the best is to pick nothing.
