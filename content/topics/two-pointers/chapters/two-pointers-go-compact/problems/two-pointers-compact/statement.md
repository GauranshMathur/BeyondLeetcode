# Compact repeated items

Go's `slices.Compact` removes repeats from a slice without allocating a second one: one pointer reads and one writes.

Add:

| Command | What it does | Prints |
|---|---|---|
| `compact` | The sequence is sorted. Replaces each run of equal items with one item, the first of the run, keeping the order. The sequence gets shorter. | the new length |

## Example

Input:

```
load 1 1 2 3 3 3 5
compact
show
```

Output:

```
4
1 2 3 5
```

`1 1 2 3 3 3 5` has runs `1 1`, `2`, `3 3 3` and `5`. Four items remain.
