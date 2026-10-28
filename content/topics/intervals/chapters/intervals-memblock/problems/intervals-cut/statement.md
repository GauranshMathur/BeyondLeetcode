# Cut a range out

The Chapter reads how Linux's memblock removes a range from its list by splitting the regions at its edges. This Extra Problem branches off `place` and asks for that. Nothing here flows into the Core Problems after it.

Add:

| Command | What it does | Prints |
|---|---|---|
| `cut lo hi` | Takes every whole number from `lo` to `hi` out of the numbers that `add` and `place` have put in, so `merged` no longer shows them. | the same two numbers as `place`: how many intervals `merged` would print now, and how many whole numbers they hold |

An interval can be cut in two, and one that lies inside the cut disappears. Numbers outside `lo hi` stay. If the numbers were not there, nothing changes and the two numbers are printed all the same. A later `add` or `place` can put numbers back.

## Example

Input:

```
place 1 10
cut 4 6
merged
cut 1 3
merged
```

Output:

```
1 10
2 7
1-3 7-10
1 4
7-10
```

`place 1 10` holds 10 numbers. Cutting 4 to 6 leaves `1-3` and `7-10`: 2 intervals and 3 + 4 = 7 numbers. Cutting 1 to 3 removes the first interval completely.
