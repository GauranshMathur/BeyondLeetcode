# The busiest K seconds

To count exactly, a limiter looks at the last `K` seconds, whatever second that is. As the clock moves, the window moves with it: one second enters, one leaves.

Add:

| Command | What it does | Prints |
|---|---|---|
| `peak K` | Looks at every **window**: `K` consecutive items. | the largest total of any window; `0` if the sequence is empty |

`K` is at least 1. A window never goes past the ends of the sequence. If `K` is larger than the sequence, the one window is the whole sequence. The sequence does not change.

## Example

Input:

```
load 0 0 6 6 0 0 1
blocks 3
peak 3
```

Output:

```
6
12
```

`blocks 3` is 6, as before. The windows of three are `0 0 6`, `0 6 6`, `6 6 0`, `6 0 0` and `0 0 1`, with totals 6, 12, 12, 6 and 1. The burst the blocks could not see is the window `0 6 6`.
