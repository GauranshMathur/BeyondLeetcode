# Merge two runs, newest wins

LevelDB rewrites sorted files by merging them, and when two files hold the same key, the newer entry wins. Here a sequence holds two **runs**: the first `K` items are the newer run and the rest are the older run. Within a run the items are strictly increasing, so no item repeats inside a run. The items are keys.

Add:

| Command | What it does | Prints |
|---|---|---|
| `merge K` | The first `K` items are the newer run and the rest the older run. Replaces the sequence with one strictly increasing run that holds every key of either run once. A key found in both runs is kept from the newer run only. | one line of letters separated by spaces, one per item of the new sequence, in order: `N` if the item came from the newer run, `O` if from the older run (an empty line if the new sequence is empty) |

`K` is between 0 and the length of the sequence.

## Example

Input:

```
load 2 5 9 1 5 7 12
merge 3
show
```

Output:

```
O N N O N O
1 2 5 7 9 12
```

The newer run is `2 5 9` and the older run is `1 5 7 12`. The merged run is `1 2 5 7 9 12`. The key 5 is in both, so it is kept once, from the newer run, which is why its letter is `N`. The older run's 5 is skipped.
