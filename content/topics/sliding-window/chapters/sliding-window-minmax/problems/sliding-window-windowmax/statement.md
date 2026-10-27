# The maximum of every window

Linux's congestion control BBR wants the largest delivery rate seen in the last few round trips. This Problem asks for the exact largest item of every window, in order, with a queue that forgets items that can no longer win.

Add:

| Command | What it does | Prints |
|---|---|---|
| `windowmax K` | Looks at every **window**: `K` consecutive items, from the first window to the last. | the largest item of each window, in order, separated by single spaces; an empty line if the sequence is empty |

`K` is at least 1. A window never goes past the ends of the sequence. If `K` is larger than the sequence, the one window is the whole sequence. Items may be any integers. The sequence does not change.

## Example

Input:

```
load 1 3 2 5 4 1 1 6
windowmax 3
```

Output:

```
3 5 5 5 4 6
```

The windows are `1 3 2`, `3 2 5`, `2 5 4`, `5 4 1`, `4 1 1` and `1 1 6`, with the largest items 3, 5, 5, 5, 4 and 6.
