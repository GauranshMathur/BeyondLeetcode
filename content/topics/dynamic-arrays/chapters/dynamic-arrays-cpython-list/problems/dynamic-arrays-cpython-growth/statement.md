Add a third growth rule, `policy cpython`, taken from CPython 3.13.0 as quoted in the Chapter.

When `append` finds the block full, let `n` be the length the list is about to have (the current length plus 1). The new capacity is:

```
(n + (n >> 3) + 6) & ~3
```

`n >> 3` is `n` divided by 8 with the remainder dropped. `& ~3` rounds down to a multiple of 4.

The other rules and all earlier commands keep working as before.

Under `cpython`, `fill N X` has `N` at most 200,000.

## Example

Input:

```
policy cpython
cap
append 1
cap
fill 3 2
cap
append 5
cap
copies
```

Output:

```
0
4
4
8
4
```

The first append needs `n = 1`: `(1 + 0 + 6) & ~3` is 4. The fifth needs `n = 5`: `(5 + 0 + 6) & ~3` is 8, and it copies the 4 items already there.
