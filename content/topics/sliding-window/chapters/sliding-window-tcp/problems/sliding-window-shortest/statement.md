# The fewest segments that carry S bytes

The last Problem asked for the longest run that fits under a limit. This one is the mirror image: the shortest run that reaches a target. The window grows until it is big enough, and then shrinks from the left for as long as it stays big enough. The rule below is written for this Problem; it is not a claim about how TCP sends data.

Every item is again positive (at least 1).

Add:

| Command | What it does | Prints |
|---|---|---|
| `shortest S` | Looks at every **run**: one or more consecutive items. A run **reaches** `S` if the total of its items is at least `S`. | the smallest number of items in a run that reaches `S`; `0` if no run does, including when the sequence is empty |

`S` is at least 1. The sequence does not change.

## Example

Input:

```
load 3 1 4 1 5 9 2 6
shortest 15
```

Output:

```
3
```

The run `9 2 6` has total 17 and three items. `5 9 2` has total 16 and three items. No run of two items reaches 15: the biggest pair, `9 2`, has total 11, and `2 6` has 8. The answer is 3.
