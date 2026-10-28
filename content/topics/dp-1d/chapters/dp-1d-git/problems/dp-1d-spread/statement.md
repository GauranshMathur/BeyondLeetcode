# Picks at least K apart

`pick` reads back two answers, so it keeps two numbers. If the rule reaches back `K` items, the table you may forget is the last `K` answers, as in git's three rows ([the Chapter](/chapters/dp-1d-git)).

The values and the rules of picking are those of `pick`, with a stronger rule: any two picked items must be at least `K` places apart, that is, their positions in the sequence differ by `K` or more. With `K` of 2 that is `pick`; with `K` of 1 there is no restriction.

Add:

| Command | What it does | Prints |
|---|---|---|
| `spread K` | Finds the picks, at least `K` apart, with the largest total value. | that total; `0` if the sequence is empty or no pick beats picking nothing |

`K` is between 1 and 100000 and may be larger than the sequence. The sequence has at most 2000 items. The sequence does not change. `pick` still has to work.

## Example

Input:

```
load 4 1 1 5 2 6
spread 2
spread 3
spread 1
```

Output:

```
15
10
19
```

With `K` of 2 the best picks are the items at positions 0, 3 and 5: 4 + 5 + 6 = 15. With `K` of 3 the items at positions 3 and 5 are too close, so the best is positions 0 and 5: 4 + 6 = 10. With `K` of 1 you may pick everything that is positive: 4 + 1 + 1 + 5 + 2 + 6 = 19.
