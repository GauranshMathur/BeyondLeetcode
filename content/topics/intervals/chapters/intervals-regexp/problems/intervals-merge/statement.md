# Merge the ranges

The Chapter reads how Go's regexp parser cleans a list of ranges: sort them, then merge the ones that touch. This Problem builds that step on intervals of whole numbers. The rule below is written for this Problem; it uses the idea in the Chapter, not the parser's code.

An **interval** `lo hi` holds every whole number from `lo` to `hi`, both included. In every command of this Topic, `0 <= lo <= hi <= 1000000000`. Two intervals **touch** when they share a number, or when one ends right before the other starts so that no whole number lies between them. `3 5` and `5 8` touch, and so do `3 5` and `6 8`. `3 5` and `7 8` do not.

Add:

| Command | What it does | Prints |
|---|---|---|
| `add lo hi` | Adds the interval to the Build. The same interval can be added more than once. | nothing |
| `merged` | Looks at every interval added so far and merges two that touch into one, over and over, until no two touch. Merging two intervals gives the interval from the smaller `lo` to the larger `hi`. | the merged intervals, smallest `lo` first, each as `lo-hi`, separated by single spaces; `none` if no interval has been added |

`merged` changes nothing that was added: more intervals can follow, and `merged` can run again.

## Example

Input:

```
add 5 8
add 1 3
add 2 4
add 10 10
merged
```

Output:

```
1-8 10-10
```

`1 3` and `2 4` share the numbers 2 and 3, so they become `1 4`. That ends right before `5 8` starts, so those touch as well, and everything becomes `1 8`. The number 9 is held by no interval, so `10 10` stays alone.
