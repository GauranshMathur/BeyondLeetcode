# Trim the ends

`str.strip()` in CPython scans in from both ends and stops at the first item that is not padding. In this Build, **0 is the padding**.

Add:

| Command | What it does | Prints |
|---|---|---|
| `trim` | Removes every 0 from the start of the sequence and every 0 from the end, and keeps everything between. Zeros inside stay. | how many items it removed |

A sequence that is all zeros becomes empty, and `trim` prints its old length.

## Example

Input:

```
load 0 0 3 4 0 5 0
trim
show
```

Output:

```
3
3 4 0 5
```

Two zeros go from the front and one from the end: 3 items removed. The 0 between 4 and 5 stays.
