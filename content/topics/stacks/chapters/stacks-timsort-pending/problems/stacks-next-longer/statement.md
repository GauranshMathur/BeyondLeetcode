The pending stack pops while its top is out of order. Use the same loop on its own.

| Command | What it does | Prints |
|---|---|---|
| `nextlonger L1 L2 ... Ln` | Reads `n` run lengths. For each run, finds the first run after it that is longer. | `n` numbers on one line, separated by spaces: for run `i`, the distance `j - i` to the first later run `j` with `Lj > Li`, or `0` if no later run is longer |

`n` is between 1 and 100,000, and each length is between 1 and 1,000,000,000. A longer run must be strictly longer: an equal length does not count.

## Example

Input:

```
nextlonger 5 3 8 8 2 9
```

Output:

```
2 1 3 2 1 0
```

The first run (5) is passed by the third (8), two places on. The third (8) is passed only by the last (9), three places on, and the fourth (8) by the same one, two places on.
