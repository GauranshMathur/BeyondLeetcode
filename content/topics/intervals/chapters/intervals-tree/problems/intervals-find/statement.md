# Find what overlaps

The Chapter reads the Linux kernel's interval tree, which finds the intervals that overlap a query without looking at the others. This Problem asks for the same answer on the intervals the Build holds. The rule below is written for this Problem; it uses the idea in the Chapter, not the kernel's code.

Add:

| Command | What it does | Prints |
|---|---|---|
| `find lo hi` | Looks at the intervals that `add` and `place` have put in, as they were given and not merged, and picks those that share at least one whole number with `lo hi`. | the picked intervals, the smallest `lo` first, and among equal `lo` the one added first, each as `lo-hi`, separated by single spaces; `none` if no interval was picked |

`0 <= lo <= hi <= 1000000000`. An interval that ends exactly where the query starts, or starts exactly where it ends, is picked, because they share that number. One that ends right before the query does not share a number and is not picked. The same interval added twice is printed twice. `find` changes nothing.

## Example

Input:

```
add 1 4
add 6 9
add 3 7
add 12 15
find 5 6
find 10 11
```

Output:

```
3-7 6-9
none
```

For `5 6`: `1 4` ends before 5, so it is out. `6 9` holds 6 and `3 7` holds 5 and 6, so both are picked, and `3 7` comes first because its `lo` is smaller. `12 15` starts after 6. For `10 11`, no interval holds 10 or 11.
