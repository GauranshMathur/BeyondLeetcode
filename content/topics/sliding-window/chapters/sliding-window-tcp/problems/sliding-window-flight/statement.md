# How many segments fit the window

A TCP sender may have data outstanding only up to the right edge of the window the receiver offered. This Problem asks how many whole segments can be in flight at once when the window is `W` bytes and the segments go out in order. The rule below is written for this Problem; it uses the idea in the Chapter, not the protocol itself.

From here on in this Topic, a Problem says which commands expect items that are positive, which means 1 or more. In this Problem and the next, every item of the sequence is the size of one segment in bytes, so it is at least 1.

Add:

| Command | What it does | Prints |
|---|---|---|
| `flight W` | Looks at every **run**: one or more consecutive items. A run **fits** if the total of its items is at most `W`. | the greatest number of items in a run that fits; `0` if no run fits, including when the sequence is empty |

`W` is at least 0. The sequence does not change.

## Example

Input:

```
load 3 1 4 1 5 9 2 6
flight 10
```

Output:

```
4
```

The run `3 1 4 1` has total 9 and four items. The run `1 4 1 5` has total 11, over the window. The run `4 1 5` has total 10 and three items. No run of five items fits, so the answer is 4.
