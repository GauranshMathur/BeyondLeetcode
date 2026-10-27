# Pair sum in sorted data

From here the sequence you `load` may be **sorted** (smallest first, equal items next to each other), and the Problem says so when it is. The Tests only call a command on a sorted sequence if the command needs one.

Add:

| Command | What it does | Prints |
|---|---|---|
| `pairsum T` | The sequence is sorted. Finds two items, at different positions, whose sum is `T`. | their positions, counted from 1: `i j` with `i < j`; or `none` if there is no such pair |

If several pairs add up to `T`, print the pair with the smallest `i`, and if several of those have that `i`, the one with the largest `j`. The sequence does not change.

## Example

Input:

```
load 1 3 4 6 9
pairsum 10
pairsum 7
pairsum 100
```

Output:

```
1 5
1 4
none
```

The first Example Test is shown. `pairsum 10` finds 1 + 9 at positions 1 and 5; `pairsum 7` finds 1 + 6 at positions 1 and 4; no two items add up to 100. In the second Example Test every pair of the four 2s adds up to 4, and the rule picks positions 1 and 4.
