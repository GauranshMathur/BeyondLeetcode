The median of a stream is the middle key once the keys so far are sorted. When there is an even number of keys, take the lower of the two middle ones.

| Command | What it does | Prints |
|---|---|---|
| `track K` | Adds `K` to the keys being tracked. | the median of every key given to `track` so far |

`track` is separate from the main heap and from the other commands: the keys it tracks are not in the main heap, and `push`, `pop` and the rest do not touch them.

Use two heaps from your Build: one holding the smaller half of the keys, where you can reach the largest of them, and one holding the larger half, where you can reach the smallest. The Build's heap gives you the smallest item first, so for the half where you need the largest, store negated keys. Keep the halves the same size, or the smaller half one item bigger.

## Example

Input:

```
track 5
track 15
track 1
track 3
```

Output:

```
5
5
5
3
```

The medians after 5, 15, 1 and 3 are 5, then 5 (the lower of 5 and 15), then 5, then 3 (the lower of 3 and 5).
