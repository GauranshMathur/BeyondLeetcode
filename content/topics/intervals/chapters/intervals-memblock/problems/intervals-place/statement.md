# Place a range into the sorted list

The Chapter reads how Linux's memblock keeps its list of regions in order and merged after every addition. This Problem brings that to the Build: a command that adds an interval and reports what the list looks like afterwards. The rule below is written for this Problem; it uses the idea in the Chapter, not the kernel's code.

Intervals are as before: `lo hi` holds every whole number from `lo` to `hi`, and two intervals touch when they share a number or no whole number lies between them.

Add:

| Command | What it does | Prints |
|---|---|---|
| `place lo hi` | Adds the interval, exactly as `add` does. | two whole numbers separated by a space: how many intervals `merged` would print now, and how many whole numbers those intervals hold together |

`add` and `place` work on the same intervals, and `merged` prints what it did before. The first number is 0 when the Build holds no interval, and so is the second.

## Example

Input:

```
place 10 12
place 20 22
place 14 15
place 11 21
merged
```

Output:

```
1 3
2 6
3 8
1 13
10-22
```

The first `place` leaves one interval of 3 numbers. The second leaves two intervals of 3 numbers each, 6 in all. The third adds a third interval with 2 numbers: 3 intervals, 8 numbers. The fourth, `11 21`, touches all three, so they become `10 22`: one interval holding 13 numbers.
